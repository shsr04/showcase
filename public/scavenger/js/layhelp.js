// Note: shared helpers and palette for room layouts.

import { L } from './config.js';
import { PROPS } from './props.js';
import { yawToward } from './roomplan.js';

export const COL = {
  warm: [1.0, 0.72, 0.42],
  amber: [1.0, 0.68, 0.26],
  cold: [0.72, 0.86, 1.0],
  blue: [0.4, 0.62, 1.0],
  pink: [1.0, 0.32, 0.68],
  cyan: [0.28, 0.9, 1.0],
  green: [0.4, 1.0, 0.6],
  yellow: [1.0, 0.9, 0.35],
  violet: [0.62, 0.4, 1.0],
  red: [1.0, 0.25, 0.18],
  white: [1, 1, 1],
};

export const APPS = [
  'AETHER', 'CYBERFLIGHT', 'GLIDER', 'ORBIT', 'PINBALL', 'SIMZONE', 'SPHERICAL', 'SYNTHSTREAM',
  'ENDURANCE', 'RADIO', 'AMBIENCE', 'TEXT MINER', 'TRANSLATOR', 'SCAVENGER',
];

// Note: hanging lamps on a jittered grid; spacing, height above floor and colour are tunable.
export function lampGrid(R, o = {}) {
  const y = o.y ?? Math.min(5.2, R.height - 2.4);
  const sp = o.spacing ?? 9;
  const nx = Math.max(1, Math.round((2 * R.hx) / sp));
  const nz = Math.max(1, Math.round((2 * R.hz) / sp));
  const jit = o.jitter ?? 0.8;
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < nz; b++) {
      const x = R.cx + (nx === 1 ? 0 : ((a + 0.5) / nx - 0.5) * 2 * (R.hx - 2)) + R.range(-jit, jit);
      const z = R.cz + (nz === 1 ? 0 : ((b + 0.5) / nz - 0.5) * 2 * (R.hz - 2)) + R.range(-jit, jit);
      R.hang(x, z, y + R.range(-0.4, 0.4), {
        i: o.i ?? 2.0, r: o.r ?? 20, c: o.c, shade: o.shade, failMul: o.failMul,
      });
    }
  }
}

// Note: places an item in room corner i (0..3) facing the room centre; false when it does not fit.
export function corner(R, i, type, o = {}) {
  const size = o.s || PROPS[type].size;
  const m = o.inset ?? 0.3;
  const hx = size[0] / 2;
  const hz = size[2] / 2;
  const x = i === 1 || i === 2 ? R.x1 - hx - m : R.x0 + hx + m;
  const z = i >= 2 ? R.z1 - hz - m : R.z0 + hz + m;
  return R.put(type, x, z, yawToward(R.cx - x, R.cz - z), { margin: 0.02, ...o });
}

// Note: random free spots for filler items; yaw is a random quarter turn unless given.
export function scatter(R, type, n, o = {}) {
  const out = [];
  const size = o.s || PROPS[type].size;
  const m = (o.margin ?? 2) + Math.max(size[0], size[2]) / 2;
  for (let tries = 0; tries < n * 10 && out.length < n; tries++) {
    const x = R.range(R.x0 + m, R.x1 - m);
    const z = R.range(R.z0 + m, R.z1 - m);
    const yaw = o.yaw ?? R.rr.int(0, 3);
    const it = R.put(type, x, z, yaw, typeof o.make === 'function' ? o.make(out.length) : { ...o });
    if (it) out.push(it);
  }
  return out;
}

// Note: axes of a long room: u across the short side, v along the long side; maps back to x/z and wall faces.
export function longFrame(R) {
  const alongZ = R.hz >= R.hx;
  return {
    alongZ,
    hu: alongZ ? R.hx : R.hz,
    hv: alongZ ? R.hz : R.hx,
    x: (u, v) => R.cx + (alongZ ? u : v),
    z: (u, v) => R.cz + (alongZ ? v : u),
    yawU: (s) => (alongZ ? (s > 0 ? 1 : 3) : (s > 0 ? 0 : 2)),
    yawV: (s) => (alongZ ? (s > 0 ? 0 : 2) : (s > 0 ? 1 : 3)),
    wallU: (s) => (alongZ ? (s > 0 ? 0 : 1) : (s > 0 ? 4 : 5)),
    wallV: (s) => (alongZ ? (s > 0 ? 4 : 5) : (s > 0 ? 0 : 1)),
    tanU: (u, v) => (alongZ ? v : u),
  };
}

// Note: floor square of a decal layer centred on a point.
export function rug(R, x, z, hx, hz, layer, tint, o = {}) {
  return R.decal(x, z, hx, hz, layer, { tint, ...o });
}

// Note: hazard stripe frame around a rectangle on the floor.
export function hazardFrame(R, x, z, hx, hz, w = 0.6) {
  R.decal(x, z - hz - w / 2, hx + w, w / 2, L.HAZARD, { tint: [1, 1, 1] });
  R.decal(x, z + hz + w / 2, hx + w, w / 2, L.HAZARD, { tint: [1, 1, 1] });
  R.decal(x - hx - w / 2, z, w / 2, hz, L.HAZARD, { tint: [1, 1, 1] });
  R.decal(x + hx + w / 2, z, w / 2, hz, L.HAZARD, { tint: [1, 1, 1] });
}
