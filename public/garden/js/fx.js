// Note: pooled soft-sprite particles (CPU simulated) for smoke, flame, rain, sparkles and dust.

import * as THREE from 'three';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uScale); }`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.15, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`;

export class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.life.fill(0);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 30 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag;
    this.size[i] = s0; this.alpha[i] = a;
  }

  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      const d = 1 - Math.min(1, this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene) {
    this.soft = new Particles(scene, 2600, false);
    this.glow = new Particles(scene, 1800, true);
  }

  // Note: viewportH is the drawing-buffer height in device pixels.
  update(dt, camera, viewportH) {
    const scale = viewportH / (2 * camera.top);
    this.soft.update(dt, scale);
    this.glow.update(dt, scale);
  }

  smoke(x, y, z, k = 1, tint = 0.9) {
    this.soft.emit(x + (Math.random() - 0.5) * 0.08, y, z + (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12 + 0.12, 0.35 + Math.random() * 0.15, (Math.random() - 0.5) * 0.12, 2.6 * k, 0.18, 0.7, tint, tint, tint * 1.02, 0.5, 0, 0.2);
  }

  flame(x, y, z, k = 1) {
    this.glow.emit(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.1, 0.55 + Math.random() * 0.5, (Math.random() - 0.5) * 0.1, 0.7 * k, 0.28, 0.06, 1, 0.55 + Math.random() * 0.25, 0.15, 0.75, 0, 0.5);
  }

  ember(x, y, z) {
    this.glow.emit(x, y, z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, 1.6, 0.1, 0.03, 1, 0.7, 0.3, 0.9, 0.2, 0.4);
  }

  steam(x, y, z, big = false) {
    this.soft.emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25, big ? 2.4 + Math.random() : 0.5, (Math.random() - 0.5) * 0.25, big ? 1.8 : 2.4, 0.2, big ? 1.0 : 0.8, 0.98, 0.99, 1, 0.5, big ? 1.4 : 0, 0.4);
  }

  drip(x, y, z, vx = 0, vz = 0) {
    this.soft.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, vx, -0.5 - Math.random(), vz, 1.4, 0.1, 0.07, 0.65, 0.85, 1, 0.8, 9, 0);
  }

  // Note: a water droplet thrown out of a can spout along (vx, vz) that arcs down.
  pour(x, y, z, vx, vz) {
    this.soft.emit(x, y, z, vx + (Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.15, vz + (Math.random() - 0.5) * 0.15, 0.7, 0.05, 0.035, 0.7, 0.88, 1, 0.8, 9, 0);
  }

  rain(x, y, z) {
    this.soft.emit(x, y, z, 0, -7 - Math.random() * 2, 0, 0.9, 0.06, 0.05, 0.7, 0.85, 1, 0.65, 0, 0);
  }

  // Note: heavier, larger drop for storm spectacles.
  downpour(x, y, z) {
    this.soft.emit(x, y, z, 0.9, -10 - Math.random() * 3, 0.3, 0.75, 0.1, 0.08, 0.72, 0.84, 1, 0.8, 0, 0);
  }

  snow(x, y, z) {
    this.soft.emit(x, y, z, (Math.random() - 0.5) * 0.5, -1.0 - Math.random() * 0.4, (Math.random() - 0.5) * 0.5, 4, 0.1, 0.09, 1, 1, 1, 0.9, 0, 0.1);
  }

  dust(x, y, z, r = 0.7, g = 0.6, b = 0.45) {
    this.soft.emit(x + (Math.random() - 0.5) * 0.6, y + 0.05, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.9, 0.12, 0.4, r, g, b, 0.55, 1.4, 1);
  }

  spark(x, y, z, r = 1, g = 0.9, b = 0.55, speed = 1.2) {
    const a = Math.random() * 6.28; const u = Math.random();
    this.glow.emit(x, y, z, Math.cos(a) * speed * u, 0.8 + Math.random() * speed, Math.sin(a) * speed * u, 1.6 + Math.random(), 0.2, 0.04, r, g, b, 0.9, 0.5, 0.6);
  }

  // Note: soft pale dust cloud that rises slowly; used for tier completion.
  puff(x, y, z, k = 1) {
    const a = Math.random() * 6.28; const u = 0.3 + Math.random() * 0.7;
    this.soft.emit(x + Math.cos(a) * 0.3 * k, y + 0.1, z + Math.sin(a) * 0.3 * k, Math.cos(a) * 0.5 * u * k, 0.35 + Math.random() * 0.3, Math.sin(a) * 0.5 * u * k, 1.1 + Math.random() * 0.4, 0.2 * k, 0.75 * k, 0.86, 0.8, 0.7, 0.5, 0, 1.6);
  }

  // Note: gold glint that rises and falls back; tier completion.
  sparkle(x, y, z, speed = 1) {
    const a = Math.random() * 6.28; const u = 0.3 + Math.random() * 0.7;
    this.glow.emit(x, y, z, Math.cos(a) * 0.9 * speed * u, 0.9 + Math.random() * 1.3 * speed, Math.sin(a) * 0.9 * speed * u, 1.1 + Math.random() * 0.7, 0.2, 0.05, 1, 0.82 + Math.random() * 0.1, 0.35, 0.9, 1.6, 0.5);
  }

  // Note: slow warm-green mote that drifts and fades; the view emits a few per T4 building at night.
  firefly(x, y, z) {
    const a = Math.random() * 6.28; const s = 0.1 + Math.random() * 0.12;
    this.glow.emit(x, y, z, Math.cos(a) * s, (Math.random() - 0.5) * 0.12, Math.sin(a) * s, 4 + Math.random() * 2.5, 0.16, 0.16, 0.8, 1, 0.45, 0.85, 0, 0.12);
  }

  leaf(x, y, z, wx, wz, c =[0.45, 0.78, 0.4]) {
    this.soft.emit(x, y, z, wx * 2 + (Math.random() - 0.5), 0.1 + Math.random() * 0.4, wz * 2 + (Math.random() - 0.5), 3, 0.1, 0.08, c[0], c[1], c[2], 0.9, 0.2, 0.5);
  }

  // Note: spring blossom petal: soft pale pink, drifts down slowly with the wind.
  petal(x, y, z, wx, wz) {
    const k = Math.random();
    this.soft.emit(x, y, z, wx * 1.6 + (Math.random() - 0.5) * 0.35, -0.3 - Math.random() * 0.2, wz * 1.6 + (Math.random() - 0.5) * 0.35, 5 + Math.random() * 1.5, 0.09, 0.07, 1, 0.78 + k * 0.12, 0.86 + k * 0.08, 0.85, 0.02, 0.15);
  }

  // Note: autumn leaf: warm tint, falls and tumbles sideways.
  fall(x, y, z, wx, wz, c) {
    this.soft.emit(x, y, z, wx * 1.8 + (Math.random() - 0.5) * 0.7, -0.15 - Math.random() * 0.2, wz * 1.8 + (Math.random() - 0.5) * 0.7, 4.5 + Math.random(), 0.11, 0.09, c[0], c[1], c[2], 0.92, 0.12, 0.35);
  }

  wind(x, y, z, wx, wz, s) {
    this.soft.emit(x, y, z, wx * (3 + s * 8), 0, wz * (3 + s * 8), 1.4, 0.05, 0.12, 1, 1, 1, 0.22, 0, 0);
  }

  // Note: warm sky lantern that rises slowly and drifts with the wind.
  lantern(x, y, z, wx = 0, wz = 0) {
    this.glow.emit(x, y, z, wx * 0.8 + (Math.random() - 0.5) * 0.12, 0.45 + Math.random() * 0.25, wz * 0.8 + (Math.random() - 0.5) * 0.12, 9 + Math.random() * 3, 0.34, 0.3, 1, 0.74 + Math.random() * 0.1, 0.38, 0.9, 0, 0.05);
  }

  // Note: low pale mist that drifts slowly; the Spire isle breathes it.
  mist(x, y, z, k = 1, tint = 0.92) {
    this.soft.emit(x, y, z, (Math.random() - 0.5) * 0.3 + 0.12, 0.04 + Math.random() * 0.08, (Math.random() - 0.5) * 0.3, 7 + Math.random() * 3, 1.6 * k, 3.4 * k, tint, tint, tint * 1.04, 0.07, 0, 0.1);
  }

  // Note: slow blue-white cloud mote for the whale cloud; k scales the size.
  whale(x, y, z, vx, vz, k = 1) {
    this.soft.emit(x, y, z, vx, (Math.random() - 0.5) * 0.08, vz, 9 + Math.random() * 3, 1.6 * k, 2.6 * k, 0.88, 0.93, 1, 0.34, 0, 0.02);
  }

  // Note: faint gold mote for the comet and aurora; hangs in the air and fades.
  star(x, y, z, r = 1, g = 0.9, b = 0.7) {
    this.glow.emit(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, 3 + Math.random() * 2, 0.22, 0.04, r, g, b, 0.8, 0, 0.3);
  }
}
