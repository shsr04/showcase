// Note: item 364: one pixel-art part list per roster model, shared by the figure in hand (people.js) and the gun on the floor (items.js); f runs from butt or grip end (0) to muzzle (1), o is the offset to the gun's right.

import { C } from './palette.js';
import { tone } from './draw.js';

const G = (k) => [C.GOLD, k];
const seg = (col, f0, f1, w, o = 0) => ['s', col, f0, f1, w, o];
const dot = (col, f, o, w, h = w) => ['d', col, f, o, w, h];
const corner = (col, f, o, w, h = w) => ['c', col, f, o, w, h];
const blue = C.IRON;
const hi = C.IRON_L;

// Note: the Winchester 1873 rifle: iron receiver, blued magazine tube under the barrel, iron forend cap.
const winchester73 = [
  seg(C.DARK, 0, 0.05, 3.8), seg(C.WOOD, 0.05, 0.34, 3.2), seg(C.PLANK, 0.07, 0.32, 0.9, -0.9), seg(C.WOOD_D, 0.07, 0.32, 0.8, 1),
  seg(blue, 0.34, 0.52, 3), seg(hi, 0.34, 0.52, 0.9, -0.9), seg(hi, 0.37, 0.55, 0.8, 2),
  seg(C.WOOD_L, 0.52, 0.7, 2.6), seg(blue, 0.7, 1, 1.8), seg(hi, 0.7, 1, 0.7, -0.5),
  seg(tone(blue, 0.15), 0.54, 0.94, 0.9, 1), dot(blue, 0.7, 0, 0.6, 2.8), dot(C.DARK, 0.96, 0, 0.7, 0.7), seg(hi, 0.97, 1, 2.2),
];


// Note: a revolver seen from above: tapering grip with its backstrap, hammer spur, frame, a cylinder wider than the frame with flutes, then the barrel with rib, front sight and optional ejector housing; g, c0 and c1 are where the grip, frame and cylinder end.
function revolver(o) {
  const { g = 0.3, c0 = 0.56, grip = C.WOOD, metal = blue, shine = hi, gw = 2.4, cw = 3.8, bw = 1.8, flutes = 4, ejector = true, extra = [] } = o;
  const parts = [
    seg(grip, 0, g, gw), seg(tone(grip, 0.25), 0.03, g - 0.04, 0.6, -0.6), corner(o.butt || C.DARK, 0, -(gw + 0.4) / 2, 0.7, gw + 0.4),
    seg(metal, g - 0.04, g + 0.06, 1.8), dot(metal, g - 0.02, 0, 1.2, 1.2), dot(C.DARK, g - 0.04, 0, 0.6, 0.8), ...(o.gate === false ? [] : [dot(C.DARK, g + 0.05, 0.9, 1, 0.8)]),
    seg(metal, g + 0.06, c0 - 0.02, 2.6), seg(shine, g + 0.06, c0 - 0.02, 0.6, -0.9),
    seg(metal, c0 - 0.2, c0, cw), seg(C.DARK, c0 - 0.2, c0, 0.4, -cw / 2), seg(C.DARK, c0 - 0.2, c0, 0.4, cw / 2),
  ];
  if (flutes) parts.push(seg(tone(metal, -0.35), c0 - 0.18, c0 - 0.02, 0.4, -cw / 4), seg(tone(metal, -0.35), c0 - 0.18, c0 - 0.02, 0.4, cw / 4), seg(shine, c0 - 0.18, c0 - 0.02, 0.5, 0));
  parts.push(seg(metal, c0, 1, bw), seg(shine, c0, 1, 0.5, -bw / 4), seg(C.DARK, c0, 1, 0.4, bw / 2 + 0.2), dot(C.DARK, 0.97, 0, 0.6, 0.6));
  if (ejector) parts.push(seg(C.DARK, c0 + 0.04, 0.86, 0.9, bw / 2 + 1), seg(shine, c0 + 0.04, 0.86, 0.35, bw / 2 + 0.8), dot(C.DARK, 0.88, bw / 2 + 1, 0.8, 1));
  return [...parts, ...extra];
}

export const GUN_PARTS = {
  winchester73,
  // Note: Colt Single Action Army: walnut grip with a brass butt strap, loading-gate frame, fluted cylinder, ejector rod on the right.
  colt73: revolver({ g: 0.3, c0: 0.56, grip: C.WOOD, extra: [dot(C.BLUE, 0.38, -0.5, 1, 0.8), dot(tone(C.GOLD, -0.45), 0.44, 0.5, 1, 0.8)] }),
  // Note: Schofield: squared walnut butt, latch seam on the frame, ribbed barrel, no ejector rod, longer cylinder.
  schofield: revolver({ g: 0.3, c0: 0.6, grip: C.WOOD, ejector: false, gate: false, extra: [dot(C.DARK, 0.33, 0, 0.3, 2.4), dot(hi, 0.35, 0, 0.9, 1.4), seg(hi, 0.6, 1, 0.4, 0)] }),
  // Note: No. 3 Russian: nickel finish, hooked backstrap, latch seam, long ribbed barrel, round butt cap.
  russian: revolver({ g: 0.28, c0: 0.54, grip: C.WOOD, metal: hi, shine: C.STONE_L, butt: hi, ejector: false, gate: false, bw: 1.9, extra: [dot(hi, 0.25, 0, 1.2, 1.6), dot(C.DARK, 0.52, 0, 0.3, 2.4), seg(hi, 0.54, 1, 0.4, 0)] }),
  // Note: Remington 1875: closed top strap, ejector housing with its web, plain walnut grip, a heavy sheathed barrel.
  remington75: revolver({ g: 0.3, c0: 0.55, grip: C.WOOD, bw: 1.9, flutes: 0, ejector: false, extra: [seg(blue, 0.56, 0.84, 1.2, 1.4), seg(hi, 0.56, 0.84, 0.4, 1.6)] }),
  // Note: Colt 1878 Double Action: black hard-rubber grip, large round trigger guard, loading gate and rod, shorter barrel.
  colt78: revolver({ g: 0.34, c0: 0.6, grip: C.SHADOW, butt: C.DARK, extra: [] }),
  // Note: Lightning: small nickel frame, bird's-head grip of black rubber, short barrel, small rod.
  lightning: revolver({ g: 0.36, c0: 0.64, grip: C.SHADOW, metal: hi, shine: C.STONE_L, butt: hi, cw: 3.2, gw: 2.2, bw: 1.5, extra: [] }),

  // Note: Remington double derringer: two barrels side by side seen from above, spur hammer, bird-beak grip.
  derringer: [
    seg(C.WOOD_D, 0, 0.36, 2), seg(C.WOOD, 0.04, 0.32, 0.5, -0.4), dot(blue, 0.36, 0, 1.2, 1.2), dot(C.DARK, 0.35, 0, 0.5, 0.8),
    seg(blue, 0.4, 0.62, 2.2), seg(hi, 0.4, 0.62, 0.5, -0.7), dot(hi, 0.56, 1.3, 0.9, 0.8),
    seg(blue, 0.62, 1, 1.6), seg(hi, 0.62, 1, 0.4, -0.4), seg(tone(blue, -0.4), 0.64, 1, 0.3, 0.5), dot(hi, 0.64, 0, 1, 1.2),
  ],

  // Note: Colt New Line .32: tiny solid-frame revolver, no trigger guard, round-butt grip, short ejector rod.
  newline: revolver({ g: 0.34, c0: 0.6, grip: C.PLASTER_L, butt: hi, cw: 3, gw: 2, bw: 1.3, flutes: 3, ejector: false, extra: [] }),

  // Note: S&W .38 Single Action: nickel top-break with its latch seam, round-butt walnut grip, short ribbed barrel.
  sw38: revolver({ g: 0.34, c0: 0.62, grip: C.WOOD, metal: hi, shine: C.STONE_L, butt: hi, cw: 3.2, gw: 2.2, bw: 1.5, ejector: false, gate: false, extra: [dot(C.DARK, 0.37, 0, 0.3, 2.4), dot(hi, 0.39, 0, 0.9, 1.4), seg(C.STONE_L, 0.62, 1, 0.4, 0)] }),









  // Note: Winchester 1873 carbine: short barrel and tube, two barrel bands, saddle ring on the left, iron receiver, crescent butt.
  winchester73c: [
    seg(C.DARK, 0, 0.06, 4), seg(C.WOOD, 0.06, 0.38, 3.2), seg(C.PLANK, 0.08, 0.36, 0.9, -0.9), seg(C.WOOD_D, 0.08, 0.36, 0.8, 1),
    seg(blue, 0.38, 0.58, 3), seg(hi, 0.38, 0.58, 0.9, -0.9), seg(hi, 0.4, 0.6, 0.8, 2), dot(hi, 0.46, -2, 1.4, 1.4),
    seg(C.WOOD_L, 0.58, 0.76, 2.6), seg(blue, 0.76, 1, 1.8), seg(hi, 0.76, 1, 0.7, -0.5),
    seg(tone(blue, 0.15), 0.6, 0.94, 0.9, 1), dot(hi, 0.76, 0, 0.6, 2.8), dot(hi, 0.93, 0, 0.6, 2.8), dot(C.DARK, 0.97, 0, 0.7, 0.7), seg(hi, 0.98, 1, 2.2),
  ],

  // Note: Winchester 1866 "Yellow Boy": brass receiver and butt plate, iron-banded forearm, saddle ring on the left, magazine tube under the barrel.
  winchester66: [
    seg(C.GOLD, 0, 0.05, 4), seg(C.WOOD, 0.05, 0.36, 3.2), seg(C.PLANK, 0.07, 0.34, 0.9, -0.9), seg(C.WOOD_D, 0.07, 0.34, 0.8, 1),
    seg(C.GOLD, 0.36, 0.56, 3.2), seg(C.GOLD_L, 0.36, 0.56, 1, -1), seg(G(-0.4), 0.4, 0.58, 0.8, 2), dot(C.DARK, 0.5, 0, 0.8, 1.2),
    seg(C.WOOD_L, 0.56, 0.74, 2.6), seg(blue, 0.74, 1, 1.8), seg(hi, 0.74, 1, 0.7, -0.5),
    seg(tone(blue, 0.15), 0.58, 0.94, 0.9, 1), dot(blue, 0.7, 0, 0.6, 3), dot(hi, 0.48, -2, 1.4, 1.4), dot(C.DARK, 0.97, 0, 0.7, 0.7), seg(hi, 0.98, 1, 2.2),
  ],

  // Note: Spencer: no tube under the barrel (rounds are in the butt), exposed hammer, loop lever, trap plate in the butt.
  spencer: [
    seg(C.DARK, 0, 0.05, 3.8), seg(C.WOOD, 0.05, 0.4, 3.2), dot(hi, 0.02, 0, 1.2, 1.2), seg(C.PLANK, 0.07, 0.38, 0.9, -0.9), seg(C.WOOD_D, 0.07, 0.38, 0.8, 1),
    seg(blue, 0.4, 0.54, 2.8), seg(hi, 0.4, 0.54, 0.8, -0.9), seg(hi, 0.42, 0.6, 0.8, 1.8), dot(C.DARK, 0.4, 0, 1, 1.2), dot(hi, 0.4, -1.8, 1, 0.8),
    seg(C.WOOD_L, 0.54, 0.7, 2.2), seg(blue, 0.7, 1, 1.5), seg(hi, 0.7, 1, 0.6, -0.4), dot(hi, 0.68, 0, 0.6, 2.4), dot(C.DARK, 0.98, 0, 0.6, 0.6),
  ],

  // Note: Springfield 1873 carbine ("trapdoor"): one-piece stock, hinged breechblock on top, lock plate and hammer on the right, one barrel band, sling bar on the left, no lever or tube.
  springfield73: [
    seg(C.DARK, 0, 0.04, 3.4), seg(C.WOOD, 0.04, 0.5, 2.8), seg(C.WOOD_D, 0.06, 0.48, 0.7, 1), seg(C.PLANK, 0.06, 0.48, 0.8, -0.8),
    seg(blue, 0.38, 0.5, 2.6), seg(hi, 0.38, 0.5, 0.8, -0.8), seg(hi, 0.42, 0.5, 1.4, 0.2), dot(blue, 0.42, 1.6, 2.4, 1), dot(C.DARK, 0.4, 1.9, 1.2, 1.4),
    seg(hi, 0.38, 0.5, 0.4, -1.8),
    seg(C.WOOD_L, 0.5, 0.85, 2.2), seg(blue, 0.62, 1, 1.4), seg(hi, 0.62, 1, 0.5, -0.4),
    dot(hi, 0.8, 0, 0.6, 3), dot(C.DARK, 0.98, 0, 0.6, 0.6),
  ],

  // Note: Sharps 1874 sporting rifle: heavy octagonal barrel, pistol-grip stock with a tang sight, falling-block lever, double set triggers.
  sharps74: [
    seg(C.DARK, 0, 0.04, 3.6), seg(C.WOOD, 0.04, 0.3, 3.4), seg(C.WOOD_D, 0.06, 0.3, 0.9, 1.1), seg(C.WOOD_L, 0.06, 0.28, 0.8, -0.9),
    seg(C.WOOD, 0.28, 0.4, 2.2), dot(C.DARK, 0.32, 0, 0.6, 3),
    seg(blue, 0.38, 0.52, 3.2), seg(hi, 0.38, 0.52, 1, -1), dot(C.DARK, 0.4, 1.5, 1.4, 1.6), dot(blue, 0.42, 1.8, 1.2, 1.4),
    seg(C.WOOD_L, 0.52, 0.66, 2.8), dot(C.STONE_L, 0.66, 0, 0.6, 2.8), seg(blue, 0.66, 1, 2.4), seg(hi, 0.66, 1, 0.8, 0), seg(tone(blue, -0.3), 0.66, 1, 0.4, -0.9), seg(tone(blue, -0.3), 0.66, 1, 0.4, 0.9), dot(C.DARK, 0.98, 0, 0.6, 0.6),
  ],

  // Note: Remington No. 1 rolling block: slim straight stock, round breechblock and big hammer, one barrel band, no lever.
  rollingblock: [
    seg(C.DARK, 0, 0.05, 3.4), seg(C.WOOD, 0.05, 0.38, 2.8), seg(C.WOOD_D, 0.07, 0.36, 0.7, 1), seg(C.PLANK, 0.07, 0.36, 0.8, -0.8),
    seg(blue, 0.36, 0.52, 3), dot(hi, 0.46, 0, 1.6, 1.6), dot(C.DARK, 0.47, 0, 0.5, 1), dot(blue, 0.4, 0, 1.4, 1.2),
    seg(C.WOOD_L, 0.52, 0.76, 2), seg(blue, 0.52, 1, 1.5), seg(hi, 0.52, 1, 0.6, -0.4), dot(hi, 0.68, 0, 0.6, 2.8), seg(hi, 0.97, 1, 1.8),
  ],

  // Note: Parker 12-gauge hammer double: two barrels side by side with a rib, two outside hammers, splinter fore-end, break-open lever.
  parker12: [
    seg(C.DARK, 0, 0.05, 3.6), seg(C.WOOD, 0.05, 0.34, 3), seg(C.WOOD_D, 0.07, 0.32, 0.8, 1), seg(C.PLANK, 0.07, 0.32, 0.8, -0.8),
    seg(blue, 0.34, 0.5, 3.2), seg(hi, 0.34, 0.5, 0.8, -1.1), dot(C.DARK, 0.4, -1.6, 1, 1.6), dot(C.DARK, 0.4, 1.6, 1, 1.6), dot(blue, 0.34, 0, 0.6, 1.2),
    seg(C.WOOD_L, 0.5, 0.7, 2.6), seg(blue, 0.5, 1, 1.3, -0.8), seg(blue, 0.5, 1, 1.3, 0.8), seg(hi, 0.5, 1, 0.4, -1.2), seg(C.DARK, 0.5, 1, 0.3, 0), seg(hi, 0.97, 1, 3),
  ],

  // Note: Colt 1878 10-gauge, barrels cut short: heavier barrels end close to the fore-end, plain blue, sling ring on the left.
  colt78shotgun: [
    seg(C.DARK, 0, 0.06, 3.8), seg(C.WOOD, 0.06, 0.4, 3.2), seg(C.WOOD_D, 0.08, 0.38, 0.8, 1), seg(C.PLANK, 0.08, 0.38, 0.8, -0.8),
    seg(blue, 0.4, 0.58, 3.4), seg(hi, 0.4, 0.58, 0.8, -1.2), dot(C.DARK, 0.46, -1.7, 1.2, 1.6), dot(C.DARK, 0.46, 1.7, 1.2, 1.6),
    seg(C.WOOD_L, 0.58, 0.74, 2.8), seg(blue, 0.58, 0.9, 1.6, -0.9), seg(blue, 0.58, 0.9, 1.6, 0.9), seg(C.DARK, 0.58, 0.9, 0.3, 0), seg(hi, 0.88, 0.9, 3.4),
  ],
};

// Note: the model's overall length against the standard span, from the barrel lengths in Flayderman and Wilson (a 7.5 in Colt is 1).
export const EXTENT = { schofield: 0.96, russian: 0.94, colt78: 0.88, lightning: 0.68, derringer: 0.45, newline: 0.5, sw38: 0.6, colt78shotgun: 0.86, winchester73c: 0.91, winchester66: 0.91, spencer: 0.9, springfield73: 0.95 };

const colOf = (c) => (Array.isArray(c) ? tone(c[0], c[1]) : c);

// Note: op lists in the people.js runOps format from the grip or butt (x0, y0) to the muzzle (x1, y1); w and o scale by `k`.
export function gunOpsFor(id, x0, y0, x1, y1, k = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ext = EXTENT[id] || 1;
  const p = (f, o = 0) => [x0 + dx * f * ext + nx * o * k, y0 + dy * f * ext + ny * o * k];
  // Note: every part is a rotated quad (a 'g' op: [col, corners, corners padded by 0.4 for an outline]) with exact ends, so it turns with the gun; thin parts keep a minimum thickness.
  const fl = len * ext;
  const quad = (f, o, hl, hw, pad) => { const ux = dx / len, uy = dy / len; const [cx, cy] = p(f, o); const L = hl + pad, Wd = hw + pad;
    return [[cx - ux * L - nx * Wd, cy - uy * L - ny * Wd], [cx + ux * L - nx * Wd, cy + uy * L - ny * Wd], [cx + ux * L + nx * Wd, cy + uy * L + ny * Wd], [cx - ux * L + nx * Wd, cy - uy * L + ny * Wd]]; };
  return GUN_PARTS[id].map(([t, col, a, b, c, d]) => {
    if (t === 's') return { col: colOf(col), f: (a + b) / 2, o: d, hl: Math.max(((b - a) * fl) / 2, 0.5), hw: Math.max(c * k, 0.67) / 2 };
    const f = t === 'c' ? a + (c * k) / 2 / fl : a; const o = t === 'c' ? b + d / 2 : b;
    return { col: colOf(col), f, o, hl: Math.max(c * k, 0.67) / 2, hw: Math.max(d * k, 0.67) / 2 };
  }).map((q) => ['g', q.col, quad(q.f, q.o, q.hl, q.hw, 0), quad(q.f, q.o, q.hl, q.hw, 0.4)]);
}
