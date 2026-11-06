// Note: visitor accents for folk rigs: wanderer cloak, pilgrim staff, merchant pack; plain primitives, no textures.

import * as THREE from 'three';
import { makeFolk } from './models.js';

const MATS = new Map();
const GEOS = new Map();
const mat = (c, double = true) => {
  const k = `${c}|${double ? 1 : 0}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92, side: double ? THREE.DoubleSide : THREE.FrontSide }); MATS.set(k, m); }
  return m;
};
const glowMat = (c) => {
  const k = `g${c}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); MATS.set(k, m); }
  return m;
};
const geo = (key, make) => {
  let g = GEOS.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEOS.set(key, g); }
  return g;
};
const part = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  return o;
};

// Note: a bell-shaped cloak around the torso, with a collar; col is the cloth colour.
function cloak(col, trim, long = 1) {
  const g = new THREE.Group();
  const h = 0.4 * long;
  g.add(part(geo(`cloak${long}`, () => new THREE.CylinderGeometry(0.104, 0.19, h, 8, 1, true)), mat(col), 0, 0.2 - h / 2 + 0.02, -0.008));
  g.add(part(geo('collar', () => new THREE.CylinderGeometry(0.112, 0.138, 0.06, 8, 1, true)), mat(trim), 0, 0.21, -0.004));
  return g;
}

function hat(col, band) {
  const g = new THREE.Group();
  g.add(part(geo('brim', () => new THREE.CylinderGeometry(0.19, 0.19, 0.012, 9)), mat(col), 0, 0.172, -0.012));
  g.add(part(geo('crown', () => new THREE.CylinderGeometry(0.075, 0.1, 0.1, 8)), mat(col), 0, 0.22, -0.012));
  g.add(part(geo('band', () => new THREE.CylinderGeometry(0.103, 0.103, 0.02, 8)), mat(band), 0, 0.19, -0.012));
  return g;
}

function staff(lit) {
  const g = new THREE.Group();
  g.add(part(geo('staff', () => new THREE.CylinderGeometry(0.014, 0.019, 0.98, 5)), mat(0x7a5638, false), 0, 0.2, 0));
  g.add(part(geo('crook', () => new THREE.TorusGeometry(0.045, 0.011, 4, 8, Math.PI * 1.4)), mat(0x7a5638, false), 0, 0.7, 0, 0, Math.PI / 2, 0));
  if (lit) g.add(part(geo('knob', () => new THREE.SphereGeometry(0.03, 6, 5)), glowMat(0xffd88a), 0, 0.62, 0.045));
  return g;
}

function pack(col, roll) {
  const g = new THREE.Group();
  g.add(part(geo('pack', () => new THREE.BoxGeometry(0.2, 0.26, 0.1)), mat(col, false), 0, 0.08, -0.14));
  g.add(part(geo('roll', () => new THREE.CylinderGeometry(0.045, 0.045, 0.24, 7)), mat(roll, false), 0, 0.235, -0.14, 0, 0, Math.PI / 2));
  g.add(part(geo('strap', () => new THREE.BoxGeometry(0.03, 0.22, 0.17)), mat(0x5a3f2a, false), 0.07, 0.1, -0.07));
  return g;
}

export const ACCENT_KINDS = ['wanderer', 'pilgrim', 'merchant', 'frigate'];

// Note: adds the accent parts to a folk rig and returns them so the caller can remove them again.
export function addAccent(rig, kind) {
  const added = [];
  const put = (parent, o) => { parent.add(o); added.push([parent, o]); };
  if (kind === 'wanderer') {
    put(rig.body, cloak(0x4f8a94, 0xd9c28a));
    put(rig.head, hat(0x6d5a8c, 0xe6c67e));
  } else if (kind === 'pilgrim') {
    put(rig.body, cloak(0xc79a4a, 0xf2e4c6, 0.7));
    const s = staff(true);
    s.position.y = rig.hand;
    put(rig.armR, s);
  } else if (kind === 'merchant') {
    put(rig.body, pack(0x9b6b3f, 0xd9c9a0));
    put(rig.head, hat(0x8a4f3a, 0xf2e4c6));
  } else if (kind === 'frigate') {
    put(rig.body, cloak(0x34507a, 0xe6c67e, 0.85));
    put(rig.head, hat(0x28344e, 0xe6c67e));
  }
  return added;
}

export function removeAccent(added) {
  for (const [parent, o] of added || []) parent.remove(o);
}

// Note: a standalone visitor figure (merchant or frigate captain) for the dock; the caller animates the rig.
export function makeVisitorFigure(kind) {
  const f = makeFolk('adult', kind === 'frigate' ? 'm' : 'f');
  const rig = f.userData.rig;
  rig.base = rig.body.position.y;
  f.userData.accent = addAccent(rig, kind);
  return f;
}
