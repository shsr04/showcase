// Note: per-vertex light bake; a vertex sees lights of its own space and of spaces across a portal rect.

import { FACE_DIR } from './config.js';
import { FreeField } from './collide.js';

const AO_STEPS = [0.45, 1.3, 2.8];
const WRAP = 0.3;

const pick = (a, x, y, z) => (a === 0 ? x : a === 1 ? y : z);

function segCrossesPortal(p, x, y, z, lx, ly, lz) {
  const ax = p.axis;
  const v0 = pick(ax, x, y, z);
  const v1 = pick(ax, lx, ly, lz);
  const pc = p.c[ax];
  const d = v1 - v0;
  if (Math.abs(d) < 1e-6) return false;
  const t = (pc - v0) / d;
  if (t < -0.02 || t > 1.02) return false;
  const qx = x + (lx - x) * t;
  const qy = y + (ly - y) * t;
  const qz = z + (lz - z) * t;
  return Math.abs(pick(p.rw, qx, qy, qz) - p.c[p.rw]) <= p.hw * 1.06 + 0.15 && Math.abs(pick(p.uh, qx, qy, qz) - p.c[p.uh]) <= p.hh * 1.06 + 0.15;
}

// Note: one shared accumulator, so a bake allocates nothing; bakes never nest.
const ACC = { sr: 0, sg: 0, sb: 0, dr: 0, dg: 0, db: 0, domW: 0, domStyle: 0 };

// Note: adds light l at vertex (x,y,z) with normal (nx,ny,nz) to ACC.
function addLight(l, x, y, z, nx, ny, nz) {
  const dx = l.p[0] - x;
  const dy = l.p[1] - y;
  const dz = l.p[2] - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const r = l.r;
  if (d2 > r * r || l.i <= 0) return;
  const d = Math.sqrt(d2) || 1e-4;
  const inv = 1 / d;
  let ndl = (nx * dx + ny * dy + nz * dz) * inv;
  ndl = (ndl + WRAP) / (1 + WRAP);
  if (ndl <= 0) return;
  const win = 1 - d2 / (r * r);
  let att = (l.i * win * win) / (1 + (l.q ?? 0.1) * d2);
  // Note: fixtures face down their normal, so points behind them get little light.
  const face = -(l.n[0] * dx + l.n[1] * dy + l.n[2] * dz) * inv;
  att *= 0.45 + 0.55 * Math.max(0, face + 0.3) / 1.3;
  const k = att * ndl;
  const cr = l.c[0] * k;
  const cg = l.c[1] * k;
  const cb = l.c[2] * k;
  if (l.style) {
    ACC.dr += cr;
    ACC.dg += cg;
    ACC.db += cb;
    const w = cr + cg + cb;
    if (w > ACC.domW) {
      ACC.domW = w;
      ACC.domStyle = l.style;
    }
  } else {
    ACC.sr += cr;
    ACC.sg += cg;
    ACC.sb += cb;
  }
}

export class LightField {
  constructor(world, plan, opts = {}) {
    this.world = world;
    this.plan = plan;
    this.ao = opts.ao !== false;
    this.field = new FreeField();
    const b = [
      plan.origin[0] - 8, plan.origin[1] - 8, plan.origin[2] - 8,
      plan.origin[0] + plan.size[0] + 8, plan.origin[1] + plan.size[1] + 8, plan.origin[2] + plan.size[2] + 8,
    ];
    this.field.gather(world, plan.i, plan.j, plan.k, b);
    this.neighbours = new Map();
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f];
      this.neighbours.set(f, world.cell(plan.i + d[0], plan.j + d[1], plan.k + d[2]));
    }
    this.sets = new Map();
    this.amb = plan.D.ambient;
    this.cache = new Map();
  }

  // Note: lights of the neighbour space across face f, i.e. the stub (f ^ 1) or the through path.
  neighbourSpaceLights(f) {
    const nb = this.neighbours.get(f);
    if (!nb || nb.deg === 0) return [];
    let sp = null;
    if (nb.through) sp = 'T';
    else if (nb.stubs.some((s) => s.f === (f ^ 1))) sp = 'S' + (f ^ 1);
    if (!sp) return [];
    return nb.lights.filter((l) => l.sp === sp);
  }

  // Note: builds (and caches) the visible-light set for one space of this cell.
  setFor(space) {
    let set = this.sets.get(space);
    if (set) return set;
    const plan = this.plan;
    set = { own: plan.lights.filter((l) => l.sp === space), via: [] };
    for (const portal of plan.portals) {
      if (portal.kind === 'hole') {
        if (portal.a === space) {
          const lights = plan.lights.filter((l) => l.sp === portal.b);
          if (lights.length) set.via.push({ portal, lights });
        } else if (portal.b === space) {
          const lights = plan.lights.filter((l) => l.sp === portal.a);
          if (lights.length) set.via.push({ portal, lights });
        }
      } else if (portal.a === space) {
        const lights = this.neighbourSpaceLights(portal.f);
        if (lights.length) set.via.push({ portal, lights });
      }
    }
    this.sets.set(space, set);
    return set;
  }

  // Note: returns a bake(x,y,z,nx,ny,nz,out) function for one space; ao toggles the SDF occlusion term.
  bakeFor(space, aoOn = true) {
    const set = this.setFor(space);
    const amb = this.amb;
    const field = this.field;
    const useAo = aoOn && this.ao;
    const D = this.plan.D;
    const fill = D.fill;
    return (x, y, z, nx, ny, nz, out) => {
      ACC.sr = 0;
      ACC.sg = 0;
      ACC.sb = 0;
      ACC.dr = 0;
      ACC.dg = 0;
      ACC.db = 0;
      ACC.domW = 0;
      ACC.domStyle = 0;
      for (let i = 0; i < set.own.length; i++) addLight(set.own[i], x, y, z, nx, ny, nz);
      for (let v = 0; v < set.via.length; v++) {
        const { portal, lights } = set.via[v];
        for (let i = 0; i < lights.length; i++) {
          const l = lights[i];
          const dx = l.p[0] - x;
          const dy = l.p[1] - y;
          const dz = l.p[2] - z;
          if (dx * dx + dy * dy + dz * dz > l.r * l.r) continue;
          if (segCrossesPortal(portal, x, y, z, l.p[0], l.p[1], l.p[2])) addLight(l, x, y, z, nx, ny, nz);
        }
      }
      // Note: ambient has a faint cool-to-warm hemisphere term so shapes read in the dark.
      const hemi = 0.7 + 0.3 * ny;
      const sr = ACC.sr + (amb[0] * hemi + fill[0] * 0.006 * (0.5 - 0.5 * ny));
      const sg = ACC.sg + (amb[1] * hemi + fill[1] * 0.006 * (0.5 - 0.5 * ny));
      const sb = ACC.sb + (amb[2] * hemi + fill[2] * 0.006 * (0.5 - 0.5 * ny));
      let ao = 1;
      if (useAo) {
        let occ = 0;
        let wsum = 0;
        for (let s = 0; s < AO_STEPS.length; s++) {
          const d = AO_STEPS[s];
          const f = field.at(x + nx * d, y + ny * d, z + nz * d);
          const o = Math.min(1, Math.max(0, (d - f) / d));
          const w = 1 / (1 + s);
          occ += o * w;
          wsum += w;
        }
        ao = 1 - 0.85 * (occ / wsum);
      }
      out.sr = sr;
      out.sg = sg;
      out.sb = sb;
      out.dr = ACC.dr;
      out.dg = ACC.dg;
      out.db = ACC.db;
      out.ao = ao;
      out.style = ACC.domStyle;
    };
  }
}
