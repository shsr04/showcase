// Note: additive sprites: lamp halos, floating dust lit by the headlamp, and glowstick bodies.

import * as THREE from 'three';
import { STICK_COLORS, MAX_STICKS } from './gear.js';
import { mulberry32 } from './rand.js';

const HALO_VERT = `
in vec4 aColor;
in float aStyle;
uniform float uScale;
uniform float uStyles[16];
uniform float uFogDensity;
out vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(0.001, -mv.z);
  float style = uStyles[int(aStyle + 0.5)];
  float px = aColor.w * uScale / dist;
  float near = smoothstep(0.7, 3.5, dist);
  float far = exp(-pow(dist * uFogDensity * 0.55, 2.0));
  float big = clamp(px / 90.0, 1.0, 4.0);
  vCol = aColor.rgb * style * near * far / big;
  gl_PointSize = clamp(px, 0.0, 200.0);
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = `
precision highp float;
in vec3 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 16.0);
  float glow = (1.0 - r2) / (1.0 + r2 * 20.0);
  gl_FragColor = vec4(vCol * (core * 1.5 + glow * 0.6), 1.0);
}
`;

const DUST_VERT = `
in vec4 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uScale;
uniform vec4 uHead;
uniform vec3 uHeadDir;
uniform vec3 uFog;
uniform float uDust;
out float vA;
out vec3 vC;
void main() {
  const float L = 30.0;
  vec3 dv = (aSeed.xyz - 0.5) * 0.5;
  vec3 q = mod(aSeed.xyz * L * 3.1 + dv * uTime - uCam, L) - L * 0.5;
  vec3 wp = uCam + q;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float dist = max(0.001, -mv.z);
  float spot = 0.0;
  if (uHead.w > 0.001) {
    vec3 hd = wp - uHead.xyz;
    float d = length(hd);
    float cosA = dot(hd / d, uHeadDir);
    spot = smoothstep(0.82, 0.97, cosA) / (1.0 + 0.04 * d * d);
  }
  float keep = step(aSeed.w, uDust);
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aSeed.w * 3.0) + aSeed.x * 40.0);
  vA = (0.05 + spot * 1.3) * tw * keep * smoothstep(0.5, 2.5, dist) * (1.0 - smoothstep(10.0, 15.0, dist));
  vC = uFog * 6.0 + vec3(1.0, 0.92, 0.8) * spot;
  gl_PointSize = clamp((0.035 + aSeed.w * 0.03) * uScale / dist, 1.0, 5.0);
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = `
precision highp float;
in float vA;
in vec3 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vC * vA * (1.0 - r2), 1.0);
}
`;

export class Fx {
  constructor(scene, shared) {
    this.scene = scene;
    this.shared = shared;
    this.uScale = { value: 600 };
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale, uStyles: shared.uStyles, uFogDensity: shared.uFogDensity },
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halos = null;
    this.dirty = true;
    this.lastRebuild = -9;
    this.haloCount = 0;
    this.uCam = { value: new THREE.Vector3() };
    this.uTime = shared.uTime;
    this.uDust = { value: 0.8 };
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uCam: this.uCam, uTime: shared.uTime, uScale: this.uScale, uHead: shared.uHead, uHeadDir: shared.uHeadDir, uFog: shared.uFogColor, uDust: this.uDust,
      },
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = this.makeDust(900);
    scene.add(this.dust);

    this.stickMeshes = [];
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8);
    for (let i = 0; i < MAX_STICKS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.stickMeshes.push(m);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_STICKS * 3), 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_STICKS * 4), 4));
    sg.setAttribute('aStyle', new THREE.BufferAttribute(new Float32Array(MAX_STICKS), 1));
    this.stickPts = new THREE.Points(sg, this.haloMat);
    this.stickPts.frustumCulled = false;
    scene.add(this.stickPts);
    this.tmpQ = new THREE.Quaternion();
    this.tmpAxis = new THREE.Vector3();
  }

  makeDust(n) {
    const rnd = mulberry32(4242);
    const seed = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seed[i * 4] = rnd();
      seed[i * 4 + 1] = rnd();
      seed[i * 4 + 2] = rnd();
      seed[i * 4 + 3] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const pts = new THREE.Points(g, this.dustMat);
    pts.frustumCulled = false;
    return pts;
  }

  markDirty() {
    this.dirty = true;
  }

  // Note: halos are rebuilt from the lights of every ready cell; lamps that are dead get none.
  rebuild(plans) {
    const items = [];
    for (const plan of plans) {
      for (const l of plan.lights) {
        if (!(l.i > 0) || l.halo === 0) continue;
        const size = l.halo || (l.kind === 'strip' ? 2.6 : l.kind === 'lamp' ? 2.2 : 2.4);
        const k = (l.haloK ?? 0.5) * Math.min(1.6, l.i);
        const off = l.kind === 'strip' ? 0.35 : 0.2;
        items.push([
          l.p[0] + l.n[0] * off, l.p[1] + l.n[1] * off, l.p[2] + l.n[2] * off,
          l.c[0] * k, l.c[1] * k, l.c[2] * k, size, l.style || 0,
        ]);
      }
    }
    const n = items.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const sty = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      pos[i * 3] = it[0];
      pos[i * 3 + 1] = it[1];
      pos[i * 3 + 2] = it[2];
      col[i * 4] = it[3];
      col[i * 4 + 1] = it[4];
      col[i * 4 + 2] = it[5];
      col[i * 4 + 3] = it[6];
      sty[i] = it[7];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
    g.setAttribute('aStyle', new THREE.BufferAttribute(sty, 1));
    if (this.halos) {
      this.scene.remove(this.halos);
      this.halos.geometry.dispose();
    }
    this.halos = new THREE.Points(g, this.haloMat);
    this.halos.frustumCulled = false;
    this.scene.add(this.halos);
    this.haloCount = n;
    this.dirty = false;
  }

  update(time, camera, rtHeight, gear, view, world, dustAmount) {
    this.uCam.value.copy(camera.position);
    this.uScale.value = rtHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.uDust.value = dustAmount;
    if (this.dirty && time - this.lastRebuild > 0.4) {
      this.lastRebuild = time;
      const plans = [];
      for (const e of view.entries.values()) {
        if (e.status === 'ready') plans.push(world.cell(e.i, e.j, e.k));
      }
      this.rebuild(plans);
    }
    const sp = this.stickPts.geometry.attributes;
    for (let i = 0; i < MAX_STICKS; i++) {
      const s = gear.sticks[i];
      const m = this.stickMeshes[i];
      if (!s) {
        m.visible = false;
        sp.aColor.array[i * 4 + 3] = 0;
        continue;
      }
      m.visible = true;
      m.position.set(s.p[0], s.p[1], s.p[2]);
      this.tmpAxis.set(s.axis[0], s.axis[1], s.axis[2]).normalize();
      this.tmpQ.setFromAxisAngle(this.tmpAxis, s.angle);
      m.quaternion.copy(this.tmpQ);
      const c = s.color;
      const breathe = 0.85 + 0.15 * Math.sin(time * 2.3 + i);
      m.material.color.setRGB(c[0] * 2.2 * breathe, c[1] * 2.2 * breathe, c[2] * 2.2 * breathe);
      sp.position.array[i * 3] = s.p[0];
      sp.position.array[i * 3 + 1] = s.p[1];
      sp.position.array[i * 3 + 2] = s.p[2];
      sp.aColor.array[i * 4] = c[0] * 1.3 * breathe;
      sp.aColor.array[i * 4 + 1] = c[1] * 1.3 * breathe;
      sp.aColor.array[i * 4 + 2] = c[2] * 1.3 * breathe;
      sp.aColor.array[i * 4 + 3] = 1.3;
    }
    sp.position.needsUpdate = true;
    sp.aColor.needsUpdate = true;
  }

  dispose() {
    if (this.halos) {
      this.scene.remove(this.halos);
      this.halos.geometry.dispose();
      this.halos = null;
    }
    this.dirty = true;
  }
}

export { STICK_COLORS };
