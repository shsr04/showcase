// Note: plant props for substations, pump houses, relay stations and locks; registers itself into the shared prop kit.

import { L, STYLE } from './config.js';
import { PROPS, PAL, WALLITEMS } from './props.js';

const UP = [0, 1, 0];

const ad = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const def = (name, size, emit, opts = {}) => {
  PROPS[name] = { size, emit, ...opts };
};

function label(b, X, str, o, right, up, size, col, emis = 1.3, style = 0) {
  b.mat(L.PLATE_DARK, col, emis, style);
  b.text(str, o, right, up, size, X.atlas, { align: 'center' });
}

function imgQuad(b, c, right, up, w, h, n) {
  const p0 = ad(ad(c, right, -w / 2), up, -h / 2);
  const p1 = ad(ad(c, right, w / 2), up, -h / 2);
  const p2 = ad(ad(c, right, w / 2), up, h / 2);
  const p3 = ad(ad(c, right, -w / 2), up, h / 2);
  b.quad(p0, p1, p2, p3, n, [0, 1, 1, 1, 1, 0, 0, 0]);
}

// Note: oil-filled transformer; x runs along the row, z faces the aisle and the three bushings stand in a line along z.
def('transformer', [4.4, 5.6, 3.6], (b, it, F, X) => {
  const [w, h, d] = it.s || PROPS.transformer.size;
  const top = h - 1.7;
  const front = d / 2 - 0.3;
  const tank = it.tint || [0.46, 0.55, 0.5];
  b.mat(L.CONCRETE, [0.55, 0.55, 0.58]);
  F.box(b, 0, 0.12, 0, w / 2 - 0.05, 0.12, d / 2 - 0.05);
  b.mat(L.PLATE_DARK, tank);
  F.box(b, 0, (0.24 + top) / 2, 0, w / 2 - 0.75, (top - 0.24) / 2, front, 'ny');
  F.box(b, 0, top + 0.06, 0, w / 2 - 0.68, 0.06, front + 0.08);
  for (const s of [-1, 1]) {
    b.mat(L.CORRUGATED, mul(tank, 1.15));
    F.box(b, s * (w / 2 - 0.4), (0.55 + top - 0.25) / 2, 0, 0.3, (top - 0.8) / 2, d / 2 - 0.6);
    b.mat(L.PIPE, [0.5, 0.52, 0.55]);
    F.cylZ(b, s * (w / 2 - 0.4), top - 0.3, -d / 2 + 0.5, d / 2 - 0.5, 0.1, 0.1, 8, true);
    F.cylZ(b, s * (w / 2 - 0.4), 0.55, -d / 2 + 0.5, d / 2 - 0.5, 0.1, 0.1, 8, true);
  }
  // Note: oil conservator rides above the lid on two saddles.
  b.mat(L.PIPE, mul(tank, 1.2));
  F.cylZ(b, -0.85, top + 0.72, -d / 2 + 0.5, d / 2 - 0.5, 0.42, 0.42, 12, true);
  b.mat(L.PLATE_DARK, [0.3, 0.31, 0.34]);
  for (const z of [-0.8, 0.8]) F.box(b, -0.85, top + 0.3, z, 0.4, 0.22, 0.06);
  // Note: porcelain bushings: a stem with four flared sheds on a flanged base, capped.
  for (const z of [-1.1, 0, 1.1]) {
    b.mat(L.PLATE_DARK, [0.28, 0.28, 0.3]);
    F.cyl(b, 0.7, top + 0.12, top + 0.3, z, 0.22, 0.22, 8, true);
    b.mat(L.PLASTIC, [0.62, 0.42, 0.28]);
    F.cyl(b, 0.7, top + 0.3, top + 1.5, z, 0.15, 0.15, 6);
    for (let k = 0; k < 4; k++) F.cyl(b, 0.7, top + 0.34 + k * 0.3, top + 0.46 + k * 0.3, z, 0.15, 0.29, 8);
    b.mat(L.METAL_BRIGHT, [0.9, 0.85, 0.8]);
    F.cyl(b, 0.7, top + 1.5, top + 1.65, z, 0.1, 0.1, 6, true);
  }
  // Note: instrument panel, hazard plate and nameplate on the aisle face.
  b.mat(L.PLATE_DARK, [0.3, 0.32, 0.36]);
  F.box(b, -0.6, 2.4, front + 0.02, 0.62, 0.34, 0.02);
  b.mat(L.METER, [1, 1, 1], 0.45);
  F.img(b, -0.95, 2.4, front + 0.045, 0.45, 0.45, 1);
  F.img(b, -0.3, 2.4, front + 0.045, 0.45, 0.45, 1);
  b.mat(L.WARN_SIGNS, [1, 1, 1]);
  F.img(b, 0.9, 1.5, front + 0.012, 0.8, 0.8, 1);
  b.mat(L.LAMP_RED, [1, 0.3, 0.2], 1.6, it.style ?? STYLE.SLOW);
  F.box(b, 1.35, 2.6, front + 0.03, 0.07, 0.07, 0.015);
  label(b, X, it.name || 'T-01', F.pt(0, 3.1, front + 0.016), F.vec(1, 0, 0), UP, 0.3, [0.95, 0.8, 0.4], 0.9);
}, { core: [1, 1, 1] });

// Note: floor-standing switchgear panel with two gauges, a lamp row, a lever handle and louvres.
def('switchgear', [1.2, 2.4, 0.9], (b, it, F) => {
  const [w, h, d] = it.s || PROPS.switchgear.size;
  const body = it.tint || [0.52, 0.58, 0.56];
  const faceOnly = 'nxpxnypynz';
  b.mat(L.PLATE_DARK, body);
  F.box(b, 0, h / 2, 0, w / 2, h / 2, d / 2, 'pz');
  b.mat(L.PLATE_DARK, mul(body, 0.82));
  F.box(b, 0, 0.78, d / 2 + 0.01, w / 2 - 0.06, 0.62, 0.01, faceOnly);
  F.box(b, 0, h - 0.5, d / 2 + 0.01, w / 2 - 0.06, 0.4, 0.01, faceOnly);
  b.mat(L.PLATE_DARK, [0.2, 0.21, 0.24]);
  F.box(b, 0, 1.52, d / 2 + 0.012, w / 2 - 0.02, 0.02, 0.004, faceOnly);
  b.mat(L.METER, [1, 1, 1], 0.4);
  F.img(b, -w * 0.22, h - 0.5, d / 2 + 0.03, 0.4, 0.4, 1);
  F.img(b, w * 0.22, h - 0.5, d / 2 + 0.03, 0.4, 0.4, 1);
  const lamps = [[1.0, 0.25, 0.15], [1.0, 0.7, 0.2], [0.3, 1.0, 0.45]];
  for (let k = 0; k < 3; k++) {
    b.mat(L.LAMP_WARM, lamps[k], 1.7, k === (it.seed % 3) ? STYLE.SLOW : 0);
    F.box(b, (k - 1) * 0.28, 1.64, d / 2 + 0.03, 0.035, 0.035, 0.012, faceOnly);
  }
  b.mat(L.PLATE_DARK, [0.9, 0.75, 0.2]);
  F.box(b, w * 0.3, 0.95, d / 2 + 0.04, 0.025, 0.24, 0.03, 'nz');
  b.mat(L.VENT, [0.7, 0.7, 0.72]);
  F.img(b, 0, 0.2, d / 2 + 0.012, w - 0.22, 0.2, 1);
});

// Note: horizontal pump set: motor, hazard coupling guard, volute casing, suction nozzle and a discharge riser.
def('pump', [3.0, 1.9, 1.5], (b, it, F) => {
  const [w, h, d] = it.s || PROPS.pump.size;
  const motor = it.tint || PAL.steel[2];
  b.mat(L.PLATE_DARK, [0.34, 0.36, 0.4]);
  F.box(b, 0, 0.1, 0, w / 2 - 0.05, 0.1, d / 2 - 0.1);
  F.box(b, -w / 2 + 0.55, 0.4, 0, 0.12, 0.2, 0.38);
  F.box(b, 0.1, 0.4, 0, 0.12, 0.2, 0.38);
  b.mat(L.PIPE, motor);
  F.cylX(b, -w / 2 + 0.2, 0.2, 0.85, 0, 0.48, 0.48, 10, true);
  b.mat(L.PLATE_DARK, mul(motor, 0.5));
  for (const x of [-w / 2 + 0.5, -0.5]) F.cylX(b, x, x + 0.1, 0.85, 0, 0.52, 0.52, 10);
  F.box(b, -0.5, 1.45, 0, 0.2, 0.12, 0.18);
  b.mat(L.HAZARD, [1, 1, 1]);
  F.cylX(b, 0.2, 0.62, 0.85, 0, 0.3, 0.3, 8, true);
  b.mat(L.PIPE, it.casing || PAL.steel[1]);
  F.cylX(b, 0.62, 1.3, 0.85, 0, 0.62, 0.62, 10, true);
  b.mat(L.PIPE, [0.6, 0.62, 0.66]);
  F.cylX(b, 1.3, w / 2, 0.85, 0, 0.26, 0.26, 8, true);
  F.cyl(b, 0.95, 1.4, h, 0, 0.2, 0.2, 8, true);
  b.mat(L.PLATE_DARK, [0.3, 0.3, 0.34]);
  F.cyl(b, 0.95, h - 0.1, h, 0, 0.3, 0.3, 8, true);
  F.cylX(b, w / 2 - 0.1, w / 2, 0.85, 0, 0.34, 0.34, 8, true);
  b.mat(L.PLATE_DARK, [0.8, 0.25, 0.2]);
  F.cyl(b, 0.95, 1.75, 1.8, d / 2 - 0.05, 0.22, 0.22, 8, true);
}, { core: [1, 1, 1] });

// Note: square lattice antenna mast with a dish and a beacon at the top; size[1] is the full height.
def('mast', [1.6, 14, 1.6], (b, it, F) => {
  const [w, h] = it.s || PROPS.mast.size;
  const q = w / 2 - 0.12;
  b.mat(L.PLATE_DARK, [0.5, 0.52, 0.56]);
  F.box(b, 0, 0.15, 0, w / 2, 0.15, w / 2);
  b.mat(L.PIPE, [0.66, 0.67, 0.7]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * q, h / 2, sz * q, 0.05, h / 2 - 0.3, 0.05);
  }
  const faces = [[-q, q, q, q], [q, q, q, -q], [q, -q, -q, -q], [-q, -q, -q, q]];
  const step = 1.4;
  let k = 0;
  for (let y = 0.3 + step; y < h - 0.5; y += step) {
    F.box(b, 0, y, q, q, 0.025, 0.025, 'nz');
    F.box(b, 0, y, -q, q, 0.025, 0.025, 'pz');
    F.box(b, q, y, 0, 0.025, 0.025, q, 'nx');
    F.box(b, -q, y, 0, 0.025, 0.025, q, 'px');
    const [x0, z0, x1, z1] = faces[k++ % 4];
    b.cyl(F.pt(x0, y - step, z0), F.pt(x1, y, z1), 0.025, 0.025, 4, true);
  }
  const dy = Math.max(3, h * 0.62);
  b.mat(L.METAL_BRIGHT, [0.85, 0.88, 0.92]);
  F.cylZ(b, 0, dy, q + 0.1, q + 0.6, 0.12, 0.85, 14, true);
  b.mat(L.PIPE, [0.5, 0.52, 0.55]);
  F.cylZ(b, 0, dy, q + 0.6, q + 1.15, 0.03, 0.03, 6, true);
  F.cylX(b, -0.55, 0.55, Math.max(2, h * 0.38), 0, 0.03, 0.03, 6, true);
  b.mat(L.LAMP_RED, [1, 0.25, 0.15], 2.2, STYLE.BEACON);
  F.cyl(b, 0, h - 0.45, h - 0.2, 0, 0.12, 0.08, 8, true);
}, { core: [0.8, 1, 0.8] });

// Note: pressure door set into a wall: hazard frame, leaf with a seam, lock wheel and two status lamps.
WALLITEMS.blastdoor = (b, it) => {
  const right = cr(it.up, it.n);
  const w = it.w;
  const h = it.h;
  b.mat(L.PLATE_DARK, [0.3, 0.31, 0.34]);
  b.obox(ad(it.p, it.n, 0.18), right, it.up, it.n, w / 2 + 0.5, h / 2 + 0.5, 0.18, 'nz');
  b.mat(L.HAZARD, [1, 1, 1]);
  for (const s of [-1, 1]) {
    b.obox(ad(ad(it.p, right, s * (w / 2 + 0.25)), it.n, 0.372), right, it.up, it.n, 0.25, h / 2 + 0.5, 0.008, 'nz');
  }
  b.obox(ad(ad(it.p, it.up, h / 2 + 0.25), it.n, 0.372), right, it.up, it.n, w / 2, 0.25, 0.008, 'nz');
  b.mat(L.PLATE_DARK, it.tint || [0.46, 0.48, 0.52]);
  b.obox(ad(it.p, it.n, 0.25), right, it.up, it.n, w / 2 - 0.05, h / 2 - 0.05, 0.12, 'nz');
  b.mat(L.PLATE_DARK, [0.2, 0.2, 0.23]);
  b.obox(ad(it.p, it.n, 0.375), right, it.up, it.n, 0.03, h / 2 - 0.1, 0.006, 'nz');
  b.mat(L.DOOR, [0.9, 0.88, 0.84]);
  imgQuad(b, ad(it.p, it.n, 0.372), right, it.up, w - 0.4, h - 0.4, it.n);
  b.mat(L.METAL_BRIGHT, [0.8, 0.8, 0.82]);
  const wheel = ad(ad(it.p, right, w * 0.18), it.n, 0.4);
  b.cyl(wheel, ad(wheel, it.n, 0.06), 0.42, 0.42, 14, true);
  b.mat(L.PLATE_DARK, [0.25, 0.25, 0.28]);
  for (const a of [right, it.up]) b.obox(ad(wheel, it.n, 0.08), a, cr(it.n, a), it.n, 0.44, 0.04, 0.025);
  b.mat(L.LAMP_WARM, [1, 0.2, 0.12], 1.8, STYLE.BEACON);
  b.disc(ad(ad(ad(it.p, it.up, h / 2 + 0.25), right, -w * 0.3), it.n, 0.385), it.n, right, it.up, 0.13, 10);
  b.mat(L.LAMP_WARM, [0.3, 1, 0.45], 1.8, 0);
  b.disc(ad(ad(ad(it.p, it.up, h / 2 + 0.25), right, w * 0.3), it.n, 0.385), it.n, right, it.up, 0.13, 10);
};
