// Note: sky dome, sun and moon lighting, fog, stars and drifting clouds driven by time of day.

import * as THREE from 'three';
import { clamp, lerp, rng } from './rand.js';

const col = (h) => new THREE.Color(h);
// Note: keyframes by tod (0 midnight, .25 sunrise, .5 noon, .75 sunset).
const KEYS = [
  { t: 0.0, top: col(0x070b22), mid: col(0x17214a), bot: col(0x1b2142), sun: col(0x8fa6ff), amb: col(0x3a4a8c), ai: 0.55 },
  { t: 0.2, top: col(0x1b2250), mid: col(0x5a527f), bot: col(0x6a5a7a), sun: col(0xffa680), amb: col(0x6a6a9c), ai: 0.7 },
  { t: 0.27, top: col(0x5d7bc4), mid: col(0xffb690), bot: col(0xffd3c0), sun: col(0xffc890), amb: col(0xb0aad0), ai: 0.95 },
  { t: 0.38, top: col(0x5aa3e6), mid: col(0xc6e4f5), bot: col(0xf6fafc), sun: col(0xfff1d8), amb: col(0xcfe4ff), ai: 1.1 },
  { t: 0.5, top: col(0x4a97e2), mid: col(0xbfe3f7), bot: col(0xf8fbfd), sun: col(0xfff6e4), amb: col(0xd6e8ff), ai: 1.15 },
  { t: 0.62, top: col(0x5aa0e4), mid: col(0xc9e2f1), bot: col(0xf7f2ea), sun: col(0xffeccc), amb: col(0xd6e2fa), ai: 1.1 },
  { t: 0.73, top: col(0x5a6fb6), mid: col(0xffa27c), bot: col(0xffc7a6), sun: col(0xff9f6a), amb: col(0xc8a8c8), ai: 0.9 },
  { t: 0.8, top: col(0x242c62), mid: col(0x7a5a86), bot: col(0x7c6280), sun: col(0xff8a78), amb: col(0x7a6aa0), ai: 0.7 },
  { t: 1.0, top: col(0x070b22), mid: col(0x17214a), bot: col(0x1b2142), sun: col(0x8fa6ff), amb: col(0x3a4a8c), ai: 0.55 },
];

// Note: soft per-season colour multipliers (spring, summer, autumn, winter); kept near 1 so the look stays.
const SEASON_MUL = {
  top: [[0.98, 1.03, 1.02], [1, 1, 1.02], [1.03, 0.99, 0.94], [0.94, 0.98, 1.05]],
  mid: [[1.03, 1.0, 1.03], [1.03, 1.0, 0.97], [1.07, 0.98, 0.87], [0.95, 0.99, 1.05]],
  bot: [[1.02, 1.0, 1.02], [1.02, 1.0, 0.98], [1.05, 0.98, 0.9], [0.97, 1.0, 1.04]],
  amb: [[1.01, 1.02, 1.0], [1.02, 1.0, 0.98], [1.05, 0.98, 0.91], [0.95, 0.98, 1.05]],
};

function sample(tod, key, out) {
  for (let k = 0; k < KEYS.length - 1; k++) {
    const a = KEYS[k]; const b = KEYS[k + 1];
    if (tod >= a.t && tod <= b.t) {
      const u = (tod - a.t) / (b.t - a.t);
      if (key === 'ai') return lerp(a.ai, b.ai, u);
      return out.copy(a[key]).lerp(b[key], u);
    }
  }
  return out.copy(KEYS[0][key]);
}

const SKY_VERT = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const SKY_FRAG = `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSunCol; uniform vec2 uSun; uniform vec2 uMoon; uniform float uNight; uniform float uAspect; uniform float uTime; uniform float uHorizon; uniform float uEclipse; uniform vec2 uEclP; uniform vec3 uComet; uniform vec2 uCometD; uniform vec3 uCometCol; uniform float uAurora; uniform vec3 uAurA; uniform vec3 uAurB; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float y = vUv.y;
  float hz = uHorizon;
  vec3 c = y > hz ? mix(uMid, uTop, pow(clamp((y - hz) / (1.0 - hz), 0.0, 1.0), 0.8)) : mix(uMid, uBot, clamp((hz - y) / hz * 1.6, 0.0, 1.0));
  vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
  float ds = length(p - uSun);
  c += uSunCol * (smoothstep(0.06, 0.035, ds) * 1.4 + exp(-ds * 5.0) * 0.32 + exp(-ds * 1.6) * 0.1) * (1.0 - uNight * 0.75);
  float dm = length(p - uMoon);
  c += vec3(0.82, 0.9, 1.0) * (smoothstep(0.04, 0.025, dm) * 1.2 + exp(-dm * 7.0) * 0.1) * uNight;
  vec2 g = floor(vUv * vec2(uAspect * 110.0, 110.0));
  float r = hash(g);
  vec2 f = fract(vUv * vec2(uAspect * 110.0, 110.0)) - 0.5;
  float star = step(0.985, r) * smoothstep(0.35, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * 2.0 + r * 40.0));
  c += vec3(1.0) * star * clamp(uNight * 1.3 - 0.15, 0.0, 1.0) * smoothstep(hz - 0.2, hz + 0.25, y);
  // Note: eclipse: a dark disc over the sun with a thin corona ring.
  if (uEclipse > 0.001) {
    float de = length(p - uEclP);
    c = mix(c, vec3(0.02, 0.02, 0.04), smoothstep(0.052, 0.046, de) * uEclipse);
    c += uSunCol * smoothstep(0.012, 0.0, abs(de - 0.058)) * 0.9 * uEclipse + vec3(1.0, 0.85, 0.6) * exp(-max(de - 0.05, 0.0) * 22.0) * 0.35 * uEclipse * step(0.05, de);
  }
  // Note: comet: bright head and a tail that fades behind it, in view space.
  if (uComet.z > 0.001) {
    vec2 d = p - uComet.xy;
    float along = dot(d, uCometD);
    float perp = length(d - uCometD * along);
    float w = 0.004 + along * 0.05;
    float tail = along > 0.0 ? exp(-perp * perp / (w * w)) * (1.0 - smoothstep(0.0, 0.42, along)) : 0.0;
    float head = exp(-length(d) * 55.0);
    c += uCometCol * (tail * 0.75 + head * 1.4) * uComet.z;
  }
  // Note: aurora: soft vertical curtains in the upper sky, strongest at night.
  if (uAurora > 0.001) {
    float band = smoothstep(hz + 0.04, hz + 0.22, y) * (1.0 - smoothstep(hz + 0.34, hz + 0.7, y));
    float wv = sin(p.x * 4.5 + sin(p.x * 2.1 + uTime * 0.17) * 2.2 + uTime * 0.11);
    float cur = pow(0.5 + 0.5 * wv, 2.6) * (0.55 + 0.45 * sin(p.x * 13.0 + uTime * 0.4));
    float hh = clamp((y - hz) / 0.5, 0.0, 1.0);
    c += mix(uAurA, uAurB, hh) * cur * band * uAurora;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// Note: soft cloud: merged smooth blobs that keep sphere normals.
export function cloudGeo(r, flat) {
  const pos = []; const nor = [];
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const rad = (0.7 + r() * 0.9) * flat;
    const g = new THREE.IcosahedronGeometry(rad, 2);
    g.scale(1, 0.6, 1);
    g.translate((i - n / 2) * flat * 0.9 + (r() - 0.5) * flat, (r() - 0.3) * flat * 0.4, (r() - 0.5) * flat * 1.2);
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

export class Sky {
  constructor(scene, renderer, shadowOn) {
    this.scene = scene;
    this.top = new THREE.Color(); this.mid = new THREE.Color(); this.bot = new THREE.Color(); this.sunC = new THREE.Color(); this.amb = new THREE.Color();
    this.dome = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false, fog: false,
      uniforms: { uTop: { value: this.top }, uMid: { value: this.mid }, uBot: { value: this.bot }, uSunCol: { value: this.sunC }, uSun: { value: new THREE.Vector2(0, 0.3) }, uMoon: { value: new THREE.Vector2(0, -2) }, uNight: { value: 0 }, uAspect: { value: 1.6 }, uTime: { value: 0 }, uHorizon: { value: 0.35 }, uEclipse: { value: 0 }, uEclP: { value: new THREE.Vector2(0, 0.3) }, uComet: { value: new THREE.Vector3(0, 0, 0) }, uCometD: { value: new THREE.Vector2(1, 0) }, uCometCol: { value: new THREE.Color(0.9, 0.95, 1) }, uAurora: { value: 0 }, uAurA: { value: new THREE.Color(0.2, 0.9, 0.55) }, uAurB: { value: new THREE.Color(0.55, 0.35, 0.9) } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    }));
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x8a7a68, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.castShadow = !!shadowOn;
    if (shadowOn) {
      const s = this.sun.shadow;
      s.mapSize.set(2048, 2048);
      s.camera.left = -32; s.camera.right = 32; s.camera.top = 32; s.camera.bottom = -32; s.camera.near = 1; s.camera.far = 140;
      s.bias = -0.0006; s.normalBias = 0.04;
    }
    scene.add(this.sun); scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9db6ff, 0.0);
    scene.add(this.moon);
    scene.fog = new THREE.Fog(0xcfe6f5, 270, 540);
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    // clouds
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: false, emissive: 0x000000, transparent: true, opacity: 0.9 });
    this.clouds = [];
    this.cloudGroup = new THREE.Group();
    scene.add(this.cloudGroup);
    const cr = rng(1234);
    const shapes = [];
    for (let i = 0; i < 8; i++) shapes.push(cloudGeo(cr, 2.2));
    const bigShapes = [];
    for (let i = 0; i < 6; i++) bigShapes.push(cloudGeo(cr, 4));
    this.span = 420;
    for (let i = 0; i < 56; i++) {
      const big = i < 26;
      const m = new THREE.Mesh(big ? bigShapes[i % bigShapes.length] : shapes[i % shapes.length], this.cloudMat);
      m.userData = { ox: (cr() - 0.5) * this.span, oz: (cr() - 0.5) * this.span, y: big ? -22 - cr() * 18 : -6 + cr() * 24, sp: 0.4 + cr() * 0.6, s: big ? 1.0 + cr() * 1.2 : 0.8 + cr() * 1.0, big };
      m.scale.setScalar(m.userData.s);
      m.rotation.y = cr() * 6.28;
      this.cloudGroup.add(m); this.clouds.push(m);
    }
    this.haze = new THREE.Color();
    this.t = 0;
    this.sm = [0, 0, 0];
    // Note: spectacle state, set each frame by spectacle.js; all values 0..1 unless noted.
    this.spec = { storm: 0, omen: 0, omenHue: 0.75, eclipse: 0, eclX: 0.1, comet: 0, cometX: 0, cometY: 0.3, cometAng: 0.5, cometHue: 0.55, aurora: 0, auroraHue: 0.4, swell: 0, spire: 0 };
    this.fogNear = 270; this.fogFar = 540;
    this.tmpC = new THREE.Color();
  }

  // Note: multiplies a colour by the season-weighted tint of the given sky key.
  tint(c, key, k) {
    const T = SEASON_MUL[key];
    const m = this.sm; m[0] = m[1] = m[2] = 0;
    for (let i = 0; i < 4; i++) { m[0] += k[i] * T[i][0]; m[1] += k[i] * T[i][1]; m[2] += k[i] * T[i][2]; }
    c.r = clamp(c.r * m[0], 0, 1); c.g = clamp(c.g * m[1], 0, 1); c.b = clamp(c.b * m[2], 0, 1);
  }

  // Note: blends the spectacle state into the colours and light; runs after the base keyframe sampling.
  applySpec(u, night) {
    const sp = this.spec; const c = this.tmpC;
    if (sp.storm > 0.001) {
      const k = sp.storm * 0.9; const grey = c.setRGB(0.26, 0.29, 0.36);
      this.top.lerp(grey, k * 0.9); this.mid.lerp(grey, k); this.bot.lerp(c.setRGB(0.5, 0.54, 0.6), k);
      this.amb.lerp(grey, k * 0.6);
    }
    if (sp.omen > 0.001) {
      const h = c.setHSL(sp.omenHue, 0.55, 0.62);
      this.mid.lerp(h, sp.omen * 0.2); this.bot.lerp(h, sp.omen * 0.16);
    }
    if (sp.swell > 0.001) {
      const g = c.setRGB(1, 0.86, 0.55);
      this.mid.lerp(g, sp.swell * 0.38); this.bot.lerp(g, sp.swell * 0.3); this.top.lerp(c.setRGB(0.8, 0.7, 0.9), sp.swell * 0.16);
      this.amb.lerp(g, sp.swell * 0.25);
    }
    if (sp.eclipse > 0.001) {
      const e = sp.eclipse;
      this.top.multiplyScalar(1 - e * 0.6); this.mid.multiplyScalar(1 - e * 0.55); this.bot.multiplyScalar(1 - e * 0.5);
      this.amb.multiplyScalar(1 - e * 0.35);
    }
    u.uEclipse.value = sp.eclipse;
    const cm = u.uComet.value;
    cm.set(sp.cometX, sp.cometY, sp.comet);
    u.uCometD.value.set(-Math.cos(sp.cometAng), -Math.sin(sp.cometAng));
    u.uCometCol.value.setHSL(sp.cometHue, 0.45, 0.82);
    u.uAurora.value = sp.aurora * (0.35 + 0.65 * Math.max(night, sp.eclipse));
    u.uAurA.value.setHSL(sp.auroraHue, 0.8, 0.5);
    u.uAurB.value.setHSL((sp.auroraHue + 0.38) % 1, 0.7, 0.5);
  }

  update(world, dt, camTarget, cam) {
    this.t += dt;
    const tod = world.tod;
    sample(tod, 'top', this.top); sample(tod, 'mid', this.mid); sample(tod, 'bot', this.bot); sample(tod, 'sun', this.sunC); sample(tod, 'amb', this.amb);
    const ai = sample(tod, 'ai');
    const sk = world.seasonK;
    if (sk) { this.tint(this.top, 'top', sk); this.tint(this.mid, 'mid', sk); this.tint(this.bot, 'bot', sk); this.tint(this.amb, 'amb', sk); }
    this.applySpec(this.dome.material.uniforms, world.night);
    const sunH = world.sunH ?? Math.sin((tod - 0.25) * Math.PI * 2);
    const ang = (tod - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang) * 0.75, Math.sin(ang), 0.55).normalize();
    this.moonDir.set(-this.sunDir.x, -this.sunDir.y, -0.4).normalize();
    const night = world.night;
    const u = this.dome.material.uniforms;
    u.uNight.value = night; u.uTime.value = this.t;
    if (cam) {
      const aspect = cam.right / cam.top;
      const toView = (d, out) => { const v = d.clone().transformDirection(cam.matrixWorldInverse); out.set(v.x * 0.5 * aspect * 0.9, v.y * 0.5 + 0.0); };
      toView(this.sunDir, u.uSun.value); toView(this.moonDir, u.uMoon.value);
      u.uAspect.value = aspect;
      u.uEclP.value.copy(sunH > 0.12 ? u.uSun.value : u.uEclP.value.set(this.spec.eclX, 0.3));
      const pitchLook = Math.asin(clamp(cam.getWorldDirection(new THREE.Vector3()).y, -1, 1));
      u.uHorizon.value = clamp(0.5 + pitchLook * 0.9 + 0.05, 0.12, 0.7);
    }
    this.sun.color.copy(this.sunC);
    this.sun.intensity = clamp(sunH * 2.2 + 0.2, 0, 2.5) * 1.15;
    this.sun.position.copy(camTarget).addScaledVector(this.sunDir, 80);
    this.sun.target.position.copy(camTarget);
    this.moon.position.copy(camTarget).addScaledVector(this.moonDir, 80);
    this.moon.intensity = night * 0.45;
    this.hemi.color.copy(this.amb);
    this.hemi.groundColor.copy(this.mid).multiplyScalar(0.55 + (sk ? sk[3] * 0.12 : 0));
    this.hemi.intensity = 0.55 + ai * 0.35;
    const spL = this.spec;
    this.sun.intensity *= 1 - spL.storm * 0.8 - spL.eclipse * 0.85 * (1 - spL.storm * 0.8);
    this.hemi.intensity *= (1 - spL.eclipse * 0.45) * (1 - spL.storm * 0.25);
    this.haze.copy(this.mid).lerp(this.bot, 0.5);
    const sp = this.spec;
    if (sp.spire > 0.001) this.haze.lerp(this.tmpC.setRGB(0.72, 0.7, 0.86), sp.spire * 0.25);
    this.scene.fog.color.copy(this.haze);
    this.scene.fog.near = this.fogNear * (1 - 0.25 * sp.spire); this.scene.fog.far = this.fogFar * (1 - 0.25 * sp.spire);
    this.cloudMat.color.copy(this.bot).lerp(new THREE.Color(0xffffff), 0.35 * (1 - night));
    this.cloudMat.emissive.copy(this.amb).multiplyScalar(0.2 + 0.1 * (1 - night));
    if (spL.storm > 0.001) this.cloudMat.color.multiplyScalar(1 - spL.storm * 0.45);
    // Note: clouds drift with the wind and wrap around the camera.
    const w = world.weather.wind;
    const half = this.span / 2;
    for (const m of this.clouds) {
      const d = m.userData;
      d.ox += (w.x * (0.5 + w.s * 4) + 0.35) * d.sp * dt * (d.big ? 0.5 : 1.3);
      d.oz += (w.z * (0.5 + w.s * 4) + 0.1) * d.sp * dt * (d.big ? 0.5 : 1.3);
      let x = d.ox - camTarget.x; let z = d.oz - camTarget.z;
      x = ((x + half) % this.span + this.span) % this.span - half;
      z = ((z + half) % this.span + this.span) % this.span - half;
      m.position.set(camTarget.x + x, d.y + Math.sin(this.t * 0.2 + d.ox) * 0.4, camTarget.z + z);
    }
    return this.haze;
  }
}
