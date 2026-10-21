// Note: streams cell meshes around the camera; builds are time sliced and ordered nearest first.

import * as THREE from 'three';
import { makeCellBuild } from './cellbuild.js';
import { cellOf, cellKey } from './plan.js';
import { FACE_DIR, CELL_ARR } from './config.js';

function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 4, true));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('meta', new THREE.BufferAttribute(a.meta, 4, true));
  g.setAttribute('lit', new THREE.BufferAttribute(a.lit, 4, true));
  g.setAttribute('dyn', new THREE.BufferAttribute(a.dyn, 4, true));
  g.setAttribute('tint', new THREE.BufferAttribute(a.tint, 4, true));
  const idx = a.count < 65536 ? new Uint16Array(a.index) : a.index;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const b = a.bounds;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
  g.boundingSphere = new THREE.Sphere();
  g.boundingBox.getBoundingSphere(g.boundingSphere);
  return g;
}

export class WorldView {
  constructor(world, scene, material, atlas, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.material = material;
    this.atlas = atlas;
    this.depth = opts.depth ?? 3;
    this.detail = opts.detail ?? 1;
    this.ao = opts.ao !== false;
    this.maxDist = opts.maxDist ?? 260;
    this.reach = opts.reach ?? 520;
    this.entries = new Map();
    this.onCell = opts.onCell || null;
    this.onCellGone = opts.onCellGone || null;
    this.buildMs = 0;
    this.cellsBuilt = 0;
    this.tris = 0;
    this.current = null;
    this.wanted = new Map();
    this.lastCam = null;
    this.lastKey = '';
  }

  // Note: cells reachable from the camera cell within a cost budget (pass cells are cheap, rooms cost one); value d is the cost.
  desired(cam, budget, slack = 0) {
    const c = cellOf(cam[0], cam[1], cam[2]);
    const out = new Map();
    const first = { i: c[0], j: c[1], k: c[2], d: 0 };
    out.set(cellKey(c[0], c[1], c[2]), first);
    const open = [first];
    while (open.length) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (open[q].d < open[bi].d) bi = q;
      const cur = open.splice(bi, 1)[0];
      const plan = this.world.cell(cur.i, cur.j, cur.k);
      for (let f = 0; f < 6; f++) {
        if (!plan.edges[f]) continue;
        const dir = FACE_DIR[f];
        const ni = cur.i + dir[0];
        const nj = cur.j + dir[1];
        const nk = cur.k + dir[2];
        const np = this.world.cell(ni, nj, nk);
        const d = cur.d + np.cost;
        if (d > budget + 1e-6) continue;
        const cx = (ni + 0.5) * CELL_ARR[0];
        const cy = (nj + 0.5) * CELL_ARR[1];
        const cz = (nk + 0.5) * CELL_ARR[2];
        const reach = np.kind === 'pass' ? this.reach : this.maxDist;
        if (Math.hypot(cx - cam[0], (cy - cam[1]) * 1.4, cz - cam[2]) > reach + 60 + slack) continue;
        const key = cellKey(ni, nj, nk);
        const old = out.get(key);
        if (old && old.d <= d) continue;
        const rec = { i: ni, j: nj, k: nk, d };
        out.set(key, rec);
        open.push(rec);
      }
    }
    return out;
  }

  readyCount(depth) {
    let n = 0;
    let total = 0;
    for (const [key, w] of this.wanted) {
      if (w.d > depth) continue;
      total++;
      const e = this.entries.get(key);
      if (e && e.status === 'ready') n++;
    }
    return { ready: n, total };
  }

  // Note: schedules builds and unloads; runs queued tasks until the time budget is spent.
  update(cam, budgetMs) {
    const key = cellOf(cam[0], cam[1], cam[2]).join(',');
    if (key !== this.lastKey || this.entries.size === 0) {
      this.lastKey = key;
      this.wanted = this.desired(cam, this.depth);
      const keep = this.desired(cam, this.depth + 1, 90);
      for (const [k, e] of this.entries) {
        if (!keep.has(k)) this.unload(k, e);
      }
      for (const [k, w] of this.wanted) {
        if (!this.entries.has(k)) {
          this.entries.set(k, { key: k, i: w.i, j: w.j, k: w.k, status: 'queued', meshes: [], d: w.d });
        }
      }
    }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!this.current) {
        let best = null;
        let bestScore = Infinity;
        for (const [k, e] of this.entries) {
          if (e.status !== 'queued') continue;
          const w = this.wanted.get(k);
          if (!w) continue;
          const cx = (e.i + 0.5) * CELL_ARR[0] - cam[0];
          const cy = (e.j + 0.5) * CELL_ARR[1] - cam[1];
          const cz = (e.k + 0.5) * CELL_ARR[2] - cam[2];
          const score = w.d * 1000 + Math.hypot(cx, cy, cz);
          if (score < bestScore) {
            bestScore = score;
            best = e;
          }
        }
        if (!best) break;
        const plan = this.world.cell(best.i, best.j, best.k);
        best.status = 'building';
        best.plan = plan;
        best.build = makeCellBuild(this.world, plan, this.atlas, { detail: this.detail, ao: this.ao });
        best.next = 0;
        this.current = best;
      }
      const e = this.current;
      const ts = performance.now();
      if (e.next < e.build.tasks.length) {
        e.build.tasks[e.next++]();
      }
      this.buildMs += performance.now() - ts;
      if (e.next >= e.build.tasks.length) {
        this.finish(e);
        this.current = null;
      }
    }
  }

  finish(e) {
    const parts = e.build.finish();
    for (const part of parts) {
      const geo = toGeometry(part.arrays);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.matrixAutoUpdate = false;
      mesh.userData.space = part.space;
      this.scene.add(mesh);
      e.meshes.push(mesh);
      this.tris += part.stats.tris;
    }
    e.tris = parts.reduce((s, p) => s + p.stats.tris, 0);
    e.status = 'ready';
    e.build = null;
    this.cellsBuilt++;
    if (this.onCell) this.onCell(e);
  }

  unload(key, e) {
    if (this.current === e) this.current = null;
    for (const m of e.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    if (e.tris) this.tris -= e.tris;
    if (this.onCellGone) this.onCellGone(e);
    this.entries.delete(key);
  }

  // Note: loads everything within the given graph depth, yielding between slices for progress.
  async preload(cam, depth, onProgress) {
    this.depth = Math.max(this.depth, depth);
    for (let guard = 0; guard < 4000; guard++) {
      this.update(cam, 12);
      const r = this.readyCount(depth);
      if (onProgress) onProgress(r.ready, r.total);
      if (r.ready >= r.total) break;
      await new Promise((res) => setTimeout(res, 0));
    }
  }

  // Note: drops every mesh; used when the seed changes.
  dispose() {
    for (const [k, e] of [...this.entries]) this.unload(k, e);
    this.current = null;
    this.lastKey = '';
  }

  stats() {
    let ready = 0;
    for (const e of this.entries.values()) if (e.status === 'ready') ready++;
    return { cells: this.entries.size, ready, tris: this.tris, buildMs: this.buildMs };
  }
}
