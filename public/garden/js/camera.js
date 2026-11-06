// Note: orthographic orbit camera with isometric default, damping and bounds.

import * as THREE from 'three';
import { clamp } from './rand.js';

export class OrbitCamera {
  constructor(aspect) {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    this.target = new THREE.Vector3(0, 3, 0);
    this.goal = new THREE.Vector3(0, 3, 0);
    this.yaw = Math.PI / 4; this.yawG = this.yaw;
    this.pitch = 0.62; this.pitchG = this.pitch;
    this.zoom = 15; this.zoomG = this.zoom;
    this.aspect = aspect;
    this.bounds = { x0: -20, x1: 20, z0: -20, z1: 20 };
    this.dist = 300;
    this.apply();
  }

  resize(w, h) { this.aspect = w / h; this.apply(); }

  rotate(dyaw, dpitch) {
    this.yawG += dyaw;
    this.pitchG = clamp(this.pitchG + dpitch, 0.28, 1.25);
  }

  snap(dir) { this.yawG += dir * Math.PI / 2; }

  zoomBy(f) { this.zoomG = clamp(this.zoomG * f, 5, 70); }

  // Note: pans in screen space; one screen pixel = 2*zoom/height world units.
  pan(dxPx, dyPx, heightPx) {
    const k = (2 * this.zoom) / heightPx;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.goal.addScaledVector(right, -dxPx * k).addScaledVector(fwd, dyPx * k / Math.max(0.35, Math.sin(this.pitch)));
    this.clampGoal();
  }

  moveKeys(rx, fz, dt) {
    const sp = this.zoom * 0.9 * dt;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.goal.addScaledVector(right, rx * sp).addScaledVector(fwd, fz * sp);
    this.clampGoal();
  }

  focus(x, y, z) { this.goal.set(x, y, z); this.clampGoal(); }

  clampGoal() {
    const b = this.bounds;
    this.goal.x = clamp(this.goal.x, b.x0, b.x1);
    this.goal.z = clamp(this.goal.z, b.z0, b.z1);
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.target.lerp(this.goal, k);
    this.yaw += (this.yawG - this.yaw) * k;
    this.pitch += (this.pitchG - this.pitch) * k;
    this.zoom += (this.zoomG - this.zoom) * (1 - Math.exp(-dt * 10));
    this.apply();
  }

  apply() {
    const c = this.cam;
    const h = this.zoom;
    c.left = -h * this.aspect; c.right = h * this.aspect; c.top = h; c.bottom = -h;
    const cp = Math.cos(this.pitch);
    c.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    c.lookAt(this.target);
    c.updateProjectionMatrix();
  }
}
