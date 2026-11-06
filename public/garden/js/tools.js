// Note: player verbs: picking under the pointer, brush ring, painting with undo and redo.

import * as THREE from 'three';
import { N } from './config.js';
import { applyTool } from './sim.js';
import { clamp } from './rand.js';

const KEEP = ['h', 'soil', 'plant', 'grow', 'moist', 'water', 'fire', 'ash', 'snow', 'stone', 'depTop'];
const TERRAIN_TOOLS = new Set(['raise', 'dig', 'water', 'fire', 'clear']);
const SKY_TOOLS = new Set(['rain', 'snow', 'sun']);
const RING_COL = {
  raise: 0xb9e08a, dig: 0xe0a56a, water: 0x6fc3ff, fire: 0xff8a3c, clear: 0xf0f0f0,
  rain: 0x8ab4ff, wind: 0xe4eef4, sun: 0xffe27a, snow: 0xffffff,
};
const SEG = 48;
const MAX_UNDO = 30;

function snapOf(isl) {
  const s = { isl };
  for (const k of KEEP) s[k] = isl[k].slice();
  return s;
}

function restore(s) {
  const isl = s.isl;
  for (const k of KEEP) isl[k].set(s[k]);
  isl.touch('terrain'); isl.touch('plant'); isl.touch('water');
}

export class Tools {
  constructor({ scene, camera, getWorld, getView, state, audio, canvas }) {
    this.scene = scene; this.camera = camera; this.getWorld = getWorld; this.getView = getView; this.state = state; this.audio = audio; this.canvas = canvas;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hasPointer = false;
    this.hit = null; // Note: { isl, fx, fz, point }
    this.painting = false;
    this.stroke = null;
    this.undoStack = [];
    this.redoStack = [];
    this.sndT = 0; this.dropT = 0; this.lastDrop = null;
    this.windStart = null;
    const pos = new Float32Array((SEG + 1) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
    this.ring = new THREE.Line(g, this.ringMat);
    this.ring.frustumCulled = false; this.ring.renderOrder = 20; this.ring.visible = false;
    scene.add(this.ring);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.arrow = new THREE.Line(wg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
    this.arrow.frustumCulled = false; this.arrow.renderOrder = 21; this.arrow.visible = false;
    scene.add(this.arrow);
    this.onChange = () => {};
  }

  setPointer(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.px = cx;
    this.hasPointer = true;
  }

  clearPointer() { this.hasPointer = false; this.hit = null; this.ring.visible = false; }

  pick() {
    const view = this.getView();
    if (!view || !this.hasPointer) { this.hit = null; return; }
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(view.terrainMeshes(), false);
    if (!hits.length) { this.hit = null; return; }
    const h = hits[0];
    const isl = h.object.userData.isl;
    this.hit = { isl, fx: h.point.x - isl.wx + N / 2, fz: h.point.z - isl.wz + N / 2, point: h.point };
  }

  down() {
    if (this.painting || !this.hasPointer) return;
    this.pick();
    if (!this.hit) return;
    this.painting = true;
    this.stroke = { snaps: new Map(), moved: false };
    this.sndT = 0; this.dropT = 0; this.lastDrop = null;
    const t = this.state.tool;
    if (t === 'wind') this.windStart = { x: this.hit.point.x, y: this.hit.point.y, z: this.hit.point.z, isl: this.hit.isl };
    this.audio.event('tool', { gain: 0.5 });
  }

  up() {
    if (!this.painting) return;
    this.painting = false;
    const t = this.state.tool;
    if (t === 'wind' && this.windStart) {
      this.pick();
      const h = this.hit;
      if (h) {
        const dx = h.point.x - this.windStart.x; const dz = h.point.z - this.windStart.z;
        if (Math.hypot(dx, dz) > 1.2) {
          applyTool(this.getWorld(), this.windStart.isl, 'wind', 0, 0, 0, 0, { dx, dz });
          this.audio.event('wind', { gain: 0.9 });
        }
      }
    }
    this.windStart = null;
    this.arrow.visible = false;
    if (this.stroke && this.stroke.snaps.size) {
      const entry = { before: [], after: [] };
      for (const [, s] of this.stroke.snaps) { entry.before.push(s); entry.after.push(snapOf(s.isl)); }
      this.undoStack.push(entry);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack.length = 0;
      this.onChange();
    }
    this.stroke = null;
  }

  cancel() { if (this.painting) this.up(); }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    for (const s of e.before) restore(s);
    this.redoStack.push(e);
    this.audio.event('undo', { gain: 0.8 });
    this.onChange();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    for (const s of e.after) restore(s);
    this.undoStack.push(e);
    this.audio.event('undo', { gain: 0.8, pitch: 1.25 });
    this.onChange();
  }

  clearHistory() { this.undoStack.length = 0; this.redoStack.length = 0; this.onChange(); }

  update(dt, time) {
    const st = this.state;
    this.pick();
    const h = this.hit;
    const ring = this.ring;
    if (!h || st.hand) { ring.visible = false; this.arrow.visible = false; return; }
    const tool = st.tool;
    const rad = SKY_TOOLS.has(tool) || tool === 'wind' ? Math.max(3.2, st.brush * 1.8) : st.brush;
    ring.visible = true;
    this.ringMat.color.setHex(RING_COL[tool] || 0xffffff);
    this.ringMat.opacity = this.painting ? 1 : 0.7 + Math.sin(time * 4) * 0.12;
    const isl = h.isl;
    const arr = ring.geometry.attributes.position;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const fx = clamp(h.fx + Math.cos(a) * rad, 0, N - 0.01); const fz = clamp(h.fz + Math.sin(a) * rad, 0, N - 0.01);
      arr.setXYZ(k, isl.wx + fx - N / 2, isl.heightAt(fx, fz) + 0.12, isl.wz + fz - N / 2);
    }
    arr.needsUpdate = true;
    if (!this.painting) return;
    const world = this.getWorld();
    const step = Math.min(dt, 0.05);
    if (TERRAIN_TOOLS.has(tool)) {
      if (this.stroke && !this.stroke.snaps.has(isl)) this.stroke.snaps.set(isl, snapOf(isl));
      const info = applyTool(world, isl, tool, h.fx, h.fz, rad, step);
      this.sndT -= dt;
      if (info.changed && this.sndT <= 0) { this.sndT = tool === 'fire' ? 0.5 : 0.35; this.audio.event(tool, { gain: 0.8, pan: clamp(this.ndc.x, -1, 1) * 0.6 }); }
      if (info.changed) this.fxHit(tool, h);
    } else if (SKY_TOOLS.has(tool)) {
      this.dropT -= dt;
      const far = !this.lastDrop || this.lastDrop.isl !== isl || Math.hypot(this.lastDrop.fx - h.fx, this.lastDrop.fz - h.fz) > 2.6;
      if (this.dropT <= 0 && far) {
        this.dropT = 0.8;
        this.lastDrop = { isl, fx: h.fx, fz: h.fz };
        applyTool(world, isl, tool, h.fx, h.fz, st.brush, 0, { drop: true });
        this.audio.event(tool, { gain: 0.9, pan: clamp(this.ndc.x, -1, 1) * 0.6 });
      }
    } else if (tool === 'wind' && this.windStart) {
      const a = this.arrow.geometry.attributes.position;
      const s = this.windStart; const e = h.point;
      const y = Math.max(s.y, e.y) + 0.6;
      const dx = e.x - s.x; const dz = e.z - s.z; const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l; const uz = dz / l;
      a.setXYZ(0, s.x, y, s.z); a.setXYZ(1, e.x, y, e.z); a.setXYZ(2, e.x - ux * 0.6 - uz * 0.4, y, e.z - uz * 0.6 + ux * 0.4);
      a.needsUpdate = true;
      this.arrow.visible = true;
    }
  }

  fxHit(tool, h) {
    const fx = this.getView()?.fx;
    if (!fx) return;
    const p = h.point;
    if (tool === 'dig') { if (Math.random() < 0.6) fx.dust(p.x, p.y, p.z); }
    else if (tool === 'raise') { if (Math.random() < 0.4) fx.dust(p.x, p.y, p.z, 0.6, 0.75, 0.45); }
    else if (tool === 'water') fx.drip(p.x, p.y + 1.5, p.z);
    else if (tool === 'clear') { if (Math.random() < 0.5) fx.leaf(p.x, p.y + 0.3, p.z, 0.2, 0.1); }
  }

  dispose() {
    this.scene.remove(this.ring); this.scene.remove(this.arrow);
    this.ring.geometry.dispose(); this.arrow.geometry.dispose();
  }
}
