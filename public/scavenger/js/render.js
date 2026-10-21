// Note: world shader material, texture array helpers and the HDR post chain (bloom, grade, CRT dial).

import * as THREE from 'three';
import { L, SP, LAYER_COUNT } from './config.js';
import { TEX } from './textures.js';
import { SKY_SUN, SKY_PLANET } from './hulls.js';

const VERT = `
in vec4 meta;
in vec4 lit;
in vec4 dyn;
in vec4 tint;
out vec3 vPos;
out vec3 vN;
out vec2 vUv;
out vec3 vStatic;
out vec3 vDyn;
out vec4 vTint;
out float vAO;
flat out float vLayer;
flat out float vStyle;
void main() {
  vPos = position;
  vN = normal;
  vUv = uv;
  vec3 s = lit.rgb;
  vStatic = s * s * 4.0;
  vec3 d = dyn.rgb;
  vDyn = d * d * 4.0;
  vAO = lit.a;
  vTint = vec4(tint.rgb * 2.0, tint.a * 3.0);
  vLayer = floor(meta.x * 255.0 + 0.5);
  vStyle = floor(meta.y * 255.0 + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform sampler2DArray uTex;
uniform sampler2D uFont;
uniform samplerCube uSky;
uniform mat3 uSkyMat;
uniform float uSkySeed;
uniform vec4 uHullA[8];
uniform vec4 uHullB[8];
uniform float uStyles[16];
uniform float uGloss[64];
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uHead;
uniform vec3 uHeadDir;
uniform vec3 uHeadCol;
uniform vec4 uGlowPos[6];
uniform vec3 uGlowCol[6];
uniform float uAmbientBoost;
uniform vec4 uPing;
uniform float uPingA;
in vec3 vPos;
in vec3 vN;
in vec2 vUv;
in vec3 vStatic;
in vec3 vDyn;
in vec4 vTint;
in float vAO;
flat in float vLayer;
flat in float vStyle;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash31(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// Note: sharp procedural stars on a cube-face grid; the radius follows the pixel footprint so they stay crisp at any zoom.
vec3 skyStars(vec3 d) {
  vec3 a = abs(d);
  float m = max(a.x, max(a.y, a.z));
  vec3 fw = fwidth(d);
  float px = max(fw.x, max(fw.y, fw.z)) / m;
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float n = i == 0 ? 58.0 : 22.0;
    vec2 g = uv * n;
    vec2 id = floor(g);
    vec3 key = vec3(id, face + 7.0 * float(i) + uSkySeed * 0.37);
    float h = hash31(key);
    if (h > (i == 0 ? 0.2 : 0.3)) continue;
    float h2 = hash31(key + 3.1);
    float h3 = hash31(key + 8.7);
    float h4 = hash31(key + 1.9);
    vec2 sp = vec2(0.25 + 0.5 * h2, 0.25 + 0.5 * h3);
    float r = length(fract(g) - sp) / n;
    float mag = pow(h4, i == 0 ? 3.5 : 1.6) * (i == 0 ? 0.5 : 0.9) + 0.07;
    float rs = px * (0.55 + 0.9 * mag);
    float k = smoothstep(rs, rs * 0.25, r) * mag;
    float tw = 1.0 + 0.2 * sin(uTime * (1.3 + 3.0 * h2) + h3 * 40.0) * step(0.35, mag);
    float t = fract(h * 17.31);
    vec3 tint = t < 0.6 ? vec3(0.9, 0.94, 1.0) : (t < 0.85 ? vec3(1.0, 0.93, 0.8) : vec3(1.0, 0.72, 0.55));
    col += tint * k * tw;
  }
  return col;
}

// Note: distant station hulls as capsules; sun-lit flank, planet-shine fill, window decks; colours are display-encoded like the cube map.
vec4 skyHulls(vec3 d) {
  vec3 fw = fwidth(d);
  float px = max(max(fw.x, fw.y), fw.z) + 1e-5;
  vec3 sunD = normalize(vec3(${SKY_SUN.join(', ')}));
  vec3 plD = normalize(vec3(${SKY_PLANET.join(', ')}));
  vec3 col = vec3(0.0);
  float cover = 0.0;
  float best = 1e9;
  for (int i = 0; i < 8; i++) {
    vec4 A = uHullA[i];
    vec4 B = uHullB[i];
    if (A.w <= 0.0) continue;
    vec3 C = A.xyz;
    vec3 ax = B.xyz;
    float hl = B.w;
    float b = dot(d, ax);
    float e = dot(d, C);
    float u = clamp((e * b - dot(ax, C)) / max(1.0 - b * b, 1e-4), -hl, hl);
    float t = e + u * b;
    if (t <= 0.0) continue;
    float rd = length(d * t - (C + ax * u));
    float cov = clamp((A.w - rd) / (t * px) + 0.5, 0.0, 1.0);
    if (cov <= 0.0) continue;
    float th = max(t - sqrt(max(A.w * A.w - rd * rd, 0.0)) / sqrt(max(1.0 - b * b, 1e-3)), 1.0);
    if (th >= best) continue;
    best = th;
    vec3 P = d * th;
    float uh = clamp(dot(P - C, ax), -hl, hl);
    vec3 n = normalize(P - (C + ax * uh));
    vec3 e1 = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    float arc = atan(dot(n, cross(ax, e1)), dot(n, e1)) * A.w;
    float sun = max(dot(n, sunD), 0.0);
    float pl = max(dot(n, plD), 0.0);
    vec3 hull = vec3(0.03, 0.034, 0.045) + vec3(0.5, 0.46, 0.4) * pow(sun, 1.3) * 0.5 + vec3(0.07, 0.15, 0.3) * pl * 0.6;
    float rowU = uh / 13.0;
    float seam = smoothstep(0.44, 0.5, abs(fract(rowU / 6.0) - 0.5));
    hull *= 1.0 - 0.35 * seam;
    vec2 g = vec2(rowU, arc / 11.0);
    vec2 id = floor(g);
    vec2 fr = fract(g);
    float deck = step(0.35, hash21(vec2(id.x, float(i) + 3.0)));
    float lit = step(hash31(vec3(id, float(i))), 0.26) * deck;
    float rect = step(0.22, fr.x) * step(fr.x, 0.78) * step(0.25, fr.y) * step(fr.y, 0.75);
    float facing = smoothstep(0.12, 0.5, dot(n, -d));
    float wpx = clamp(6.0 / (th * px), 0.0, 1.0);
    float tone = hash31(vec3(id, float(i) + 9.0));
    vec3 wc = tone < 0.7 ? vec3(1.0, 0.78, 0.46) : vec3(0.7, 0.88, 1.0);
    hull += wc * lit * rect * facing * wpx * 0.75;
    col = hull;
    cover = cov;
  }
  return vec4(col, cover);
}

// Note: blinking red and white lights at both ends of every hull.
vec3 skyBeacons(vec3 d) {
  vec3 fw = fwidth(d);
  float px = max(max(fw.x, fw.y), fw.z) + 1e-5;
  float s2 = max(0.0035 * 0.0035, px * px * 1.6);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 A = uHullA[i];
    vec4 B = uHullB[i];
    if (A.w <= 0.0) continue;
    for (int k = 0; k < 2; k++) {
      vec3 ep = normalize(A.xyz + B.xyz * B.w * (k == 0 ? 1.0 : -1.0));
      float g = 1.0 - dot(d, ep);
      float on = step(fract(uTime * 0.42 + float(i) * 0.37 + float(k) * 0.5), 0.3);
      col += (k == 0 ? vec3(1.0, 0.12, 0.06) : vec3(0.75, 0.92, 1.0)) * exp(-g / s2) * (0.25 + 0.95 * on);
    }
  }
  return col;
}

void main() {
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  int layer = int(vLayer + 0.5);
  float styleV = uStyles[int(vStyle + 0.5)];
  vec3 albedo = vec3(0.5);
  vec3 emis = vec3(0.0);
  float gloss = 0.04;
  float height = 0.5;
  float detail = 1.0;
  bool lit = true;

  if (layer >= 100) {
    if (layer == ${SP.SKY}) {
      vec3 dir = uSkyMat * (-V);
      vec3 c = textureCube(uSky, dir).rgb;
      c += skyStars(dir) * (1.0 - smoothstep(0.03, 0.3, lum(c)));
      vec4 hullC = skyHulls(dir);
      c = mix(c, hullC.rgb, hullC.a);
      c += skyBeacons(dir);
      gl_FragColor = vec4(c * vTint.rgb, 1.0);
      return;
    } else if (layer == ${SP.SCREEN}) {
      vec2 uv = vUv;
      float row = floor(uv.y * 28.0);
      float scan = 0.82 + 0.18 * sin(uv.y * 28.0 * 6.2831);
      float bar = step(0.5, hash21(vec2(row, floor(uTime * 0.7 + row * 0.13))));
      float len = hash21(vec2(row, 3.7));
      float body = step(uv.x, 0.12 + 0.8 * len) * bar * step(0.04, uv.x);
      float cursor = step(fract(uTime * 0.9), 0.5) * step(abs(uv.y - 0.1), 0.04) * step(uv.x, 0.12);
      float sweep = smoothstep(0.0, 0.1, fract(uv.y * 0.6 - uTime * 0.11)) * 0.15;
      float v = (body * 0.7 + cursor + 0.09 + sweep) * scan;
      vec3 c = vTint.rgb * v * (0.7 + vTint.a);
      albedo = vec3(0.01);
      emis = c;
      lit = false;
    } else if (layer == ${SP.STATIC}) {
      float n = hash21(floor(vUv * 90.0) + floor(uTime * 24.0));
      float roll = smoothstep(0.0, 0.15, fract(vUv.y * 0.4 + uTime * 0.2));
      vec3 c = vec3(n * (0.5 + 0.5 * roll)) * vec3(0.8, 0.9, 1.0);
      albedo = vec3(0.01);
      emis = c * (0.6 + vTint.a) * vTint.rgb;
      lit = false;
    } else if (layer == ${SP.FONT}) {
      float a = texture(uFont, vUv).a;
      if (a < 0.4) discard;
      albedo = vTint.rgb * 0.85;
      emis = vTint.rgb * vTint.a * styleV;
    }
  } else {
    vec4 t = texture(uTex, vec3(vUv, vLayer));
    if (layer == ${L.FOLIAGE} && t.a < 0.5) discard;
    albedo = t.rgb * vTint.rgb;
    height = lum(t.rgb);
    gloss = uGloss[layer];
    float near = 1.0 - smoothstep(2.0, 9.0, dist);
    if (near > 0.0 && layer != ${L.FOLIAGE}) {
      vec4 t2 = texture(uTex, vec3(vUv * 4.7 + 0.31, vLayer));
      detail = mix(1.0, 0.55 + 0.9 * lum(t2.rgb), 0.45 * near);
      height += (lum(t2.rgb) - 0.5) * 0.35 * near;
    }
    albedo *= detail;
    if (layer != ${L.FOLIAGE}) emis = t.rgb * t.a * vTint.rgb * vTint.a * styleV;
  }

  // Note: screen-space bump from texture height so the headlamp reveals seams and rivets.
  vec3 dpx = dFdx(vPos);
  vec3 dpy = dFdy(vPos);
  float dbs = dFdx(height);
  float dbt = dFdy(height);
  vec3 r1 = cross(dpy, N);
  vec3 r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dbs * r1 + dbt * r2);
  vec3 Nb = normalize(abs(det) * N - grad * 0.018);
  if (!(det == det)) Nb = N;

  vec3 light = (vStatic + vDyn * styleV) * mix(0.3, 1.0, vAO);
  light += vec3(0.0035) * uAmbientBoost;
  vec3 spec = vec3(0.0);
  if (lit) {
    if (uHead.w > 0.001) {
      vec3 Lh = uHead.xyz - vPos;
      float d = length(Lh);
      Lh /= d;
      float cosA = dot(-Lh, uHeadDir);
      float spot = smoothstep(0.66, 0.975, cosA);
      float att = 1.0 / (1.0 + 0.035 * d + 0.0045 * d * d);
      float ndl = max(dot(Nb, Lh), 0.0);
      vec3 hc = uHeadCol * (uHead.w * spot * att);
      light += hc * ndl;
      vec3 Hh = normalize(Lh + V);
      spec += hc * pow(max(dot(Nb, Hh), 0.0), 36.0) * gloss * 3.0;
    }
    for (int i = 0; i < 6; i++) {
      float rad = uGlowPos[i].w;
      if (rad <= 0.0) continue;
      vec3 Lg = uGlowPos[i].xyz - vPos;
      float d = length(Lg);
      if (d > rad) continue;
      Lg /= d;
      float w = 1.0 - d / rad;
      float att = w * w / (1.0 + 0.25 * d * d);
      light += uGlowCol[i] * att * max(dot(Nb, Lg) * 0.8 + 0.2, 0.0);
      vec3 Hg = normalize(Lg + V);
      spec += uGlowCol[i] * att * pow(max(dot(Nb, Hg), 0.0), 24.0) * gloss * 2.0;
    }
  }
  if (uPingA > 0.001) {
    float pd = length(vPos - uPing.xyz);
    float ring = exp(-pow((pd - uPing.w) * 0.45, 2.0));
    float edge = clamp((abs(dFdx(height)) + abs(dFdy(height))) * 18.0, 0.0, 1.0);
    vec2 gq = abs(fract(vUv * 2.0) - 0.5);
    float grid = smoothstep(0.46, 0.5, max(gq.x, gq.y));
    emis += vec3(0.2, 1.0, 0.75) * ring * uPingA * (0.22 + 0.9 * grid + 1.2 * edge);
  }
  vec3 col = albedo * light + spec;

  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  vec3 fogC = uFogColor;
  if (uHead.w > 0.001) {
    float sc = pow(max(dot(-V, uHeadDir), 0.0), 7.0) * (1.0 - exp(-dist * 0.05));
    fogC += uHeadCol * uHead.w * sc * 0.06;
  }
  col = mix(col, fogC, f) + emis * (1.0 - 0.8 * f);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createTextureArray(data) {
  const tex = new THREE.DataArrayTexture(data, TEX, TEX, LAYER_COUNT);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const GLOSS = {
  PLATE_DARK: 0.35, PLATE_LIGHT: 0.2, PLATE_RUST: 0.12, GRATING: 0.5, HAZARD: 0.2, CORRUGATED: 0.35,
  CONCRETE: 0.05, TILE: 0.55, CARPET: 0.0, WOOD: 0.25, PIPE: 0.55, GLASS: 0.9, LINO: 0.4,
  METAL_BRIGHT: 0.9, PLASTIC: 0.45, WATER: 0.9, DOOR: 0.25, BEAM: 0.3, LED_RACK: 0.3,
};

export function createWorldMaterial(texArray, fontTex, skyTex) {
  const gloss = new Float32Array(64).fill(0.05);
  for (const [k, v] of Object.entries(GLOSS)) gloss[L[k]] = v;
  const glowPos = [];
  const glowCol = [];
  for (let i = 0; i < 6; i++) {
    glowPos.push(new THREE.Vector4(0, 0, 0, 0));
    glowCol.push(new THREE.Vector3(0, 0, 0));
  }
  const uniforms = {
    uTex: { value: texArray },
    uFont: { value: fontTex },
    uSky: { value: skyTex },
    uSkyMat: { value: new THREE.Matrix3() },
    uSkySeed: { value: 0 },
    uHullA: { value: new Float32Array(32) },
    uHullB: { value: new Float32Array(32) },
    uStyles: { value: new Float32Array(16).fill(1) },
    uGloss: { value: gloss },
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0.03, 0.03, 0.03) },
    uFogDensity: { value: 0.012 },
    uHead: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHeadDir: { value: new THREE.Vector3(0, 0, -1) },
    uHeadCol: { value: new THREE.Vector3(1.6, 1.45, 1.2) },
    uGlowPos: { value: glowPos },
    uGlowCol: { value: glowCol },
    uAmbientBoost: { value: 1 },
    uPing: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPingA: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.FrontSide,
  });
  return { material, uniforms };
}

// Note: fullscreen triangle helper for post passes.
function makeQuad(material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

const PASS_VERT = `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOWN_FRAG = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uFirst;
in vec2 vUv;
vec3 prefilter(vec3 c) {
  float b = max(c.r, max(c.g, c.b));
  float k = max(b - uThreshold, 0.0);
  k = k * k / (k + 0.5);
  return c * (k / max(b, 1e-4));
}
void main() {
  vec3 a = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture(uSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 d = texture(uSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 e = texture(uSrc, vUv).rgb;
  if (uFirst > 0.5) {
    a = prefilter(min(a, vec3(40.0)));
    b = prefilter(min(b, vec3(40.0)));
    c = prefilter(min(c, vec3(40.0)));
    d = prefilter(min(d, vec3(40.0)));
    e = prefilter(min(e, vec3(40.0)));
  }
  gl_FragColor = vec4((a + b + c + d) * 0.125 + e * 0.5, 1.0);
}
`;

const UP_FRAG = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uWeight;
in vec2 vUv;
void main() {
  vec3 s = texture(uSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb;
  s += (texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
      + texture(uSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
      + texture(uSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb
      + texture(uSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.5;
  s += texture(uSrc, vUv).rgb * 2.0;
  gl_FragColor = vec4(s / 8.0 * uWeight, 1.0);
}
`;

const COMP_FRAG = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uTime;
uniform float uExposure;
uniform float uBloomAmt;
uniform float uNostalgia;
uniform float uVignette;
uniform vec2 uRes;
uniform vec3 uTintShadow;
uniform vec3 uTintHigh;
uniform float uFlash;
uniform float uDamage;
in vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  float nost = uNostalgia;
  // Note: barrel distortion and tape wobble grow with the nostalgia dial.
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + 0.07 * nost * (r2 - 0.25));
  float wob = sin(uv.y * 40.0 + uTime * 3.0) * 0.0008 * nost + sin(uv.y * 3.0 - uTime * 0.7) * 0.0006 * nost;
  float tape = smoothstep(0.985, 1.0, sin(uTime * 0.37 + uv.y * 2.0)) * 0.004 * nost;
  uv.x += wob + tape * sin(uv.y * 90.0);
  float ca = (0.0006 + 0.0016 * nost) * (0.4 + 2.0 * r2);
  vec3 col;
  col.r = texture(uScene, uv + vec2(ca, 0.0)).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - vec2(ca, 0.0)).b;
  vec3 bl = texture(uBloom, uv).rgb;
  col += bl * uBloomAmt;
  col *= uExposure;
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * uTintShadow, col * uTintHigh, smoothstep(0.1, 0.8, l));
  col = mix(vec3(l), col, 1.0 + 0.12 * nost);
  float vig = 1.0 - uVignette * smoothstep(0.25, 0.95, length(cc) * 1.35);
  col *= vig;
  float scan = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159);
  col *= 1.0 - 0.14 * nost * (1.0 - scan);
  float mask = 0.5 + 0.5 * sin(uv.x * uRes.x * 2.0944);
  col *= 1.0 - 0.05 * nost * mask;
  col += vec3(0.06, 0.05, 0.04) * nost * smoothstep(0.995, 1.0, sin(uTime * 0.5 + 1.0)) * hash12(uv * uRes * 0.5 + uTime);
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5;
  col += g * (0.012 + 0.03 * nost);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col += uFlash * vec3(1.0, 0.95, 0.85);
  col = mix(col, col * vec3(1.0, 0.25, 0.2), uDamage);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Note: HDR scene target + dual-filter bloom + composite; call render(scene, camera) each frame.
export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 1;
    this.params = {
      exposure: 1.6, bloom: 0.55, nostalgia: 0.4, vignette: 0.55, flash: 0, damage: 0,
      tintShadow: new THREE.Vector3(0.94, 1.0, 1.06), tintHigh: new THREE.Vector3(1.06, 1.0, 0.93),
    };
    this.down = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 }, uFirst: { value: 0 } },
    });
    this.up = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT, fragmentShader: UP_FRAG, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
      uniforms: { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
    });
    this.comp = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uScene: { value: null }, uBloom: { value: null }, uTime: { value: 0 }, uExposure: { value: 1 },
        uBloomAmt: { value: 0.5 }, uNostalgia: { value: 0.4 }, uVignette: { value: 0.5 }, uRes: { value: new THREE.Vector2(1, 1) },
        uTintShadow: { value: new THREE.Vector3(1, 1, 1) }, uTintHigh: { value: new THREE.Vector3(1, 1, 1) },
        uFlash: { value: 0 }, uDamage: { value: 0 },
      },
    });
    this.downScene = makeQuad(this.down);
    this.upScene = makeQuad(this.up);
    this.compScene = makeQuad(this.comp);
    this.cam = new THREE.Camera();
    this.rtScene = null;
    this.mips = [];
    this.width = 0;
    this.height = 0;
  }

  resize(w, h, scale) {
    this.scale = scale;
    const W = Math.max(2, Math.floor(w * scale));
    const H = Math.max(2, Math.floor(h * scale));
    if (W === this.width && H === this.height && this.rtScene) return;
    this.width = W;
    this.height = H;
    if (this.rtScene) this.rtScene.dispose();
    for (const m of this.mips) m.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 4, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.mips = [];
    let mw = W;
    let mh = H;
    for (let i = 0; i < 5; i++) {
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      }));
    }
  }

  render(scene, camera, time) {
    const r = this.renderer;
    const p = this.params;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    // Note: downsample chain with a soft threshold on the first pass.
    let src = this.rtScene.texture;
    let sw = this.width;
    let sh = this.height;
    for (let i = 0; i < this.mips.length; i++) {
      const dst = this.mips[i];
      this.down.uniforms.uSrc.value = src;
      this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.down.uniforms.uThreshold.value = 0.9;
      r.setRenderTarget(dst);
      r.render(this.downScene, this.cam);
      src = dst.texture;
      sw = dst.width;
      sh = dst.height;
    }
    r.autoClear = false;
    for (let i = this.mips.length - 1; i > 0; i--) {
      const dst = this.mips[i - 1];
      this.up.uniforms.uSrc.value = this.mips[i].texture;
      this.up.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.up.uniforms.uWeight.value = 1;
      r.setRenderTarget(dst);
      r.render(this.upScene, this.cam);
    }
    r.autoClear = true;
    const u = this.comp.uniforms;
    u.uScene.value = this.rtScene.texture;
    u.uBloom.value = this.mips[0].texture;
    u.uTime.value = time;
    u.uExposure.value = p.exposure;
    u.uBloomAmt.value = p.bloom;
    u.uNostalgia.value = p.nostalgia;
    u.uVignette.value = p.vignette;
    u.uRes.value.set(r.domElement.width, r.domElement.height);
    u.uTintShadow.value.copy(p.tintShadow);
    u.uTintHigh.value.copy(p.tintHigh);
    u.uFlash.value = p.flash;
    u.uDamage.value = p.damage;
    r.setRenderTarget(null);
    r.render(this.compScene, this.cam);
  }
}
