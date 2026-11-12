// Note: props and actors for the 3D street panels (item 312): cactus, sage, rocks, poles, rails, wagons, and queued people and horses that are drawn far to near.

import { C } from '../palette.js';
import { step } from './pixel-art.js';
import { pixelFigure, pixelSide } from './pixel-figure.js';
import { box, noise } from './pixel-3d.js';
import { PW, PH, puff } from './pixel-kit.js';
import { boards } from './pixel-town.js';
import { pixelHorse, COATS } from './pixel-horse.js';
import { pixelBack } from './pixel-body.js';

// Note: coats and hats of the anonymous townsfolk.
const COLOURS = [C.WOOD, C.RED, C.BLUE, C.GREEN, C.IRON_L, C.ADOBE_D, C.STONE];
const HATS = [C.DARK, C.WOOD_L, C.SHADOW, C.PLASTER, C.PLANK];

// Note: a person to be drawn at a world point: a look, or a townsman in a coat and hat; side on toward dir, front on, or from behind.
export function person(foot, k, o = {}) {
  const { look = null, dir = 1, view = 'side', pose = 'stand', h = 1.78, cool = false } = o;
  return {
    foot,
    opts: { half: [0.22, 0.22], level: o.level, fill: o.fill ?? 0, rim: o.rim },
    make: (x, y, S, rg) => {
      const opt = { dir, lx: rg.lx, ly: rg.ly, cool, coat: COLOURS[k % COLOURS.length], hat: HATS[(k * 3) % HATS.length], back: view === 'back', ...(o.opt || {}) };
      if (view === 'back') return pixelBack(PW, PH, x, y, h * S, look, opt);
      return view === 'side' ? pixelSide(PW, PH, x, y, h * S, look, pose, opt) : pixelFigure(PW, PH, x, y, h * S, look, pose, opt);
    },
  };
}

// Note: a horse, with a rider if given, to be drawn at a world point.
export function horse(foot, o = {}) {
  const c = COATS[(o.coat ?? 0) % COATS.length];
  return {
    foot,
    opts: { half: [0.8, 0.3], len: o.rider ? 2.5 : 1.7, level: o.level, fill: o.fill ?? 0, rim: o.rim },
    make: (x, y, S, rg) => pixelHorse(PW, PH, x, y, S, { pose: o.pose || 'stand', dir: o.dir || 1, coat: c.coat, mane: c.mane, blanket: o.blanket, lx: rg.lx, ly: rg.ly, cool: o.cool, rider: o.rider || null, drop: o.drop, tilt: o.tilt, socks: o.socks, bedroll: o.bedroll, tack: o.tack, reins: o.reins }),
  };
}

// Note: draws the jobs far to near; a job is a world foot point and a layer maker, or a function for effects that sit at that depth.
export function draw(film, jobs) {
  const list = jobs.filter(Boolean).map((j) => ({ ...j, z: film.cam.project(j.foot)[2] })).sort((a, b) => b.z - a.z);
  for (const j of list) {
    if (j.go) j.go(film);
    else film.put(j.foot, (x, y, S) => j.make(x, y, S, film.rg), j.opts);
  }
}

// Note: a dust or smoke puff at a world point with a radius in metres, as a job to draw at that depth.
export const puffJob = (p, rM, c, density, squash = 0.7) => ({
  foot: p,
  go: (film) => {
    const [sx, sy] = film.cam.project(p);
    const s = film.cam.scaleAt(p) * rM;
    puff(film.px, sx, sy, s, s * squash, c, density);
  },
});

// Note: a billow of dust or smoke with volume: a cluster of round lobes, each with a dark underside and a lit crown toward the sun, solid where the cloud is thick and dithered where it thins; lit and dark are colours.
export const billow = (p, rM, { body = C.SAND_L, dark = C.SAND, lit = C.PLASTER_L, density = 0.55, squash = 0.8 } = {}) => ({
  foot: p,
  go: (film) => {
    const [sx, sy] = film.cam.project(p);
    const s = film.cam.scaleAt(p) * rM;
    const k = Math.sign(film.rg.lx) || -1;
    const out = film.px;
    puff(out, sx, sy, s * 1.2, s * squash * 1.2, body, density * 0.5);
    const lobes = density > 0.5 ? 5 : 3;
    const seed = Math.abs(Math.sin(p[0] * 12.9 + p[2] * 78.2 + p[1] * 3.1) * 437.5) % 6.28;
    for (let i = 0; i < lobes; i++) {
      const ang = seed + i * 2.1;
      const cx = sx + Math.cos(ang) * s * 0.45;
      const cy = sy + Math.sin(ang) * s * squash * 0.35;
      const r2 = s * (0.4 + 0.18 * ((i * 7) % 3) / 2);
      if (density > 0.5) {
        out.ellipse(cx - k * r2 * 0.14, cy + r2 * squash * 0.2, r2, r2 * squash, dark);
        out.ellipse(cx, cy, r2 * 0.92, r2 * squash * 0.86, body);
        puff(out, cx + k * r2 * 0.25, cy - r2 * squash * 0.25, r2 * 0.7, r2 * squash * 0.6, lit, 0.7);
      } else {
        puff(out, cx, cy, r2 * 1.1, r2 * squash * 1.1, dark, density * 0.8);
        puff(out, cx + k * r2 * 0.2, cy - r2 * squash * 0.2, r2 * 0.8, r2 * squash * 0.8, lit, density);
      }
    }
  },
});

// Note: a saguaro cactus: a ribbed trunk with an arm each side.
export const cactus = (x, z, h) => {
  const rib = (p) => ({ c: Math.floor((p[0] + p[2]) * 9) % 3 === 0 ? C.SHADOW : C.GREEN_D });
  return [
    box([x - 0.2, 0, z - 0.2], [x + 0.2, h, z + 0.2], rib),
    box([x - 0.72, h * 0.45, z - 0.14], [x - 0.15, h * 0.45 + 0.26, z + 0.14], rib),
    box([x - 0.72, h * 0.45, z - 0.14], [x - 0.48, h * 0.78, z + 0.14], rib),
    box([x + 0.15, h * 0.6, z - 0.14], [x + 0.68, h * 0.6 + 0.24, z + 0.14], rib),
    box([x + 0.44, h * 0.6, z - 0.14], [x + 0.68, h * 0.9, z + 0.14], rib),
  ];
};
// Note: a clump of sage or dry grass: a box whose material is mostly holes.
export const bush = (x, z, w, h) => box([x - w / 2, 0, z - w / 2], [x + w / 2, h, z + w / 2], (p) => (noise(Math.floor(p[0] * 24 + p[2] * 15), Math.floor(p[1] * 24 + p[2] * 19)) > 0.3 + (p[1] / h) * 0.35 ? { c: noise(Math.floor(p[0] * 12 + p[2] * 12), Math.floor(p[1] * 12)) > 0.62 ? C.GREEN : p[1] < h * 0.3 ? C.SHADOW : C.GREEN_D } : null), { noShadow: true });
// Note: a boulder: a block with chipped faces.
export const rock = (x, z, w, h, d, c = C.STONE) => box([x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2], (p, n) => ({ c: noise(Math.floor(p[0] * 5 + p[2] * 5), Math.floor(p[1] * 5)) > 0.82 ? step(c, -1) : n[1] > 0.5 ? step(c, 1) : c }), { cast: true });
// Note: a telegraph pole with its crossarm.
export const pole = (x, z, h = 6.4) => [box([x - 0.1, 0, z - 0.1], [x + 0.1, h, z + 0.1], () => ({ c: C.WOOD_D }), { cast: true }), box([x - 0.7, h - 0.5, z - 0.07], [x + 0.7, h - 0.38, z + 0.07], () => ({ c: C.WOOD }), { noShadow: true })];
// Note: a hitching rail along z: a top beam on posts, the posts a pattern of holes.
export const rail = (x, z0, z1) => box([x - 0.06, 0, z0], [x + 0.06, 1.15, z1], (p) => (p[1] > 0.98 ? { c: C.WOOD } : ((p[2] % 2.2) + 2.2) % 2.2 < 0.14 ? { c: C.WOOD_D } : null), { noShadow: true });
// Note: a hitching rail along x: a top beam on posts, the posts a pattern of holes.
export const railX = (z, x0, x1) => box([x0, 0, z - 0.06], [x1, 1.15, z + 0.06], (p) => (p[1] > 0.98 ? { c: C.WOOD } : ((p[0] % 2.2) + 2.2) % 2.2 < 0.14 ? { c: C.WOOD_D } : null), { noShadow: true });
// Note: a spoked wheel standing in the yz plane: rim, hub and spokes, open between.
export const wheel = (x, zc, r) => box([x - 0.04, 0, zc - r], [x + 0.04, r * 2, zc + r], (p) => {
  const dz = p[2] - zc;
  const dy = p[1] - r;
  const d = Math.hypot(dz, dy);
  if (d > r) return null;
  if (d > r - 0.07 || d < 0.07) return { c: C.WOOD_D };
  const a = Math.atan2(dy, dz);
  return Math.abs((((a * 6) / Math.PI + 12) % 1) - 0.5) > 0.4 ? { c: C.WOOD } : null;
}, { noShadow: true });
// Note: a freight wagon standing along z: a plank bed, a canvas hood on ribs, four wheels, a tongue.
export const wagon = (xc, zc) => [
  box([xc - 0.9, 0.7, zc - 2.2], [xc + 0.9, 1.3, zc + 2.2], (p, n) => (n[1] > 0.5 ? { c: C.WOOD_D } : boards(C.WOOD, p[0] + p[2], p[1], 0.17)), { cast: true }),
  box([xc - 0.86, 1.3, zc - 2.0], [xc + 0.86, 2.45, zc + 2.0], (p, n) => (Math.abs(n[2]) > 0.5 ? { c: Math.abs(p[0] - xc) < 0.5 && p[1] < 2.1 ? C.SHADOW : Math.abs(((p[0] - xc) * 5) % 1) < 0.1 ? C.STONE : C.PLASTER } : { c: n[1] > 0.5 ? C.PLASTER : Math.abs(((p[2] - zc) % 0.8)) < 0.05 ? C.STONE : step(C.PLASTER, p[1] > 2.0 ? 0 : -1) }), { cast: true }),
  wheel(xc - 0.95, zc - 1.3, 0.55), wheel(xc - 0.95, zc + 1.3, 0.55), wheel(xc + 0.95, zc - 1.3, 0.55), wheel(xc + 0.95, zc + 1.3, 0.55),
  box([xc - 0.05, 0.5, zc + 2.2], [xc + 0.05, 0.6, zc + 4.2], () => ({ c: C.WOOD_D }), { noShadow: true }),
];
