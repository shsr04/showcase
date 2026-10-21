// Note: one-time exterior cubemap for windows: a milky band, a blue home-like planet and a sun; stars are drawn in the shader.

import * as THREE from 'three';
import { fbm3, noise3 } from './rand.js';
import {
  makeHulls, packHulls, SKY_SUN, SKY_PLANET,
} from './hulls.js';

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Note: GL cube face convention; u,w in -1..1 with w growing downwards in the image.
function faceDir(face, u, w) {
  switch (face) {
    case 0: return [1, -w, -u];
    case 1: return [-1, -w, u];
    case 2: return [u, 1, w];
    case 3: return [u, -1, -w];
    case 4: return [u, -w, 1];
    default: return [-u, -w, -1];
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createSky(seed = 7, size = 256) {
  const Dp = norm(SKY_PLANET);
  const Ds = norm(SKY_SUN);
  const rho = 0.56;
  const Rs = Math.sin(rho);
  const bandN = norm([0.25, 0.9, -0.35]);
  const canvases = [];
  const ctxs = [];
  const images = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    canvases.push(c);
    ctxs.push(g);
    images.push(g.createImageData(size, size));
  }
  const pw = new Array(3);
  for (let f = 0; f < 6; f++) {
    const d = images[f].data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const w = ((y + 0.5) / size) * 2 - 1;
        const dir = norm(faceDir(f, u, w));
        let r = 0.004;
        let g = 0.005;
        let b = 0.01;
        // Note: milky band with dust lanes.
        const bd = dir[0] * bandN[0] + dir[1] * bandN[1] + dir[2] * bandN[2];
        const band = Math.exp(-(bd * bd) / 0.045);
        const n1 = fbm3(seed, dir[0] * 2.4, dir[1] * 2.4, dir[2] * 2.4, 3);
        const n2 = fbm3(seed + 9, dir[0] * 5.5 + 3, dir[1] * 5.5, dir[2] * 5.5, 3);
        const dust = smooth(0.42, 0.62, n2);
        const neb = band * (0.25 + 0.9 * n1) * (1 - 0.7 * dust);
        r += neb * 0.075 + n1 * 0.006;
        g += neb * 0.05 + n1 * 0.004;
        b += neb * 0.095 + n1 * 0.012;
        const warm = band * band * smooth(0.5, 0.75, n1);
        r += warm * 0.06;
        g += warm * 0.035;
        // Note: planet disc, rim glow and night lights.
        const cosT = dir[0] * Dp[0] + dir[1] * Dp[1] + dir[2] * Dp[2];
        const sin2 = 1 - cosT * cosT;
        const sinT = Math.sqrt(Math.max(0, sin2));
        if (cosT > 0 && sinT < Rs) {
          const t = cosT - Math.sqrt(Rs * Rs - sin2);
          pw[0] = dir[0] * t - Dp[0];
          pw[1] = dir[1] * t - Dp[1];
          pw[2] = dir[2] * t - Dp[2];
          const n = [pw[0] / Rs, pw[1] / Rs, pw[2] / Rs];
          const diff = Math.max(0, n[0] * Ds[0] + n[1] * Ds[1] + n[2] * Ds[2]);
          const land = fbm3(seed + 31, n[0] * 2.2 + 5, n[1] * 2.2, n[2] * 2.2, 5);
          const isLand = land > 0.55;
          const cloud = smooth(0.5, 0.75, fbm3(seed + 77, n[0] * 3.4, n[1] * 3.4 + 2, n[2] * 3.4, 4));
          let pr;
          let pg;
          let pb;
          if (isLand) {
            const h = (land - 0.55) * 3;
            pr = 0.16 + 0.22 * h;
            pg = 0.24 + 0.12 * h;
            pb = 0.1 + 0.05 * h;
          } else {
            pr = 0.02;
            pg = 0.09 + 0.05 * land;
            pb = 0.24 + 0.1 * land;
          }
          pr = pr * (1 - cloud) + 0.9 * cloud;
          pg = pg * (1 - cloud) + 0.92 * cloud;
          pb = pb * (1 - cloud) + 0.95 * cloud;
          const lightK = 0.012 + diff * 1.05;
          const rimK = Math.pow(1 - Math.max(0, n[0] * -dir[0] + n[1] * -dir[1] + n[2] * -dir[2]), 3.2);
          r = pr * lightK + rimK * (0.04 + 0.28 * diff);
          g = pg * lightK + rimK * (0.09 + 0.4 * diff);
          b = pb * lightK + rimK * (0.2 + 0.7 * diff);
          if (diff < 0.12 && isLand) {
            const cityN = noise3(seed + 5, n[0] * 60, n[1] * 60, n[2] * 60);
            const city = smooth(0.78, 0.9, cityN) * (1 - diff / 0.12) * (1 - cloud * 0.8);
            r += city * 0.75;
            g += city * 0.5;
            b += city * 0.18;
          }
        } else if (cosT > 0 && sinT < Rs * 1.05) {
          const k = 1 - (sinT - Rs) / (Rs * 0.05);
          const lightSide = Math.max(0, (dir[0] - Dp[0]) * Ds[0] + (dir[1] - Dp[1]) * Ds[1] + (dir[2] - Dp[2]) * Ds[2]) + 0.35;
          r += k * k * 0.03 * lightSide;
          g += k * k * 0.1 * lightSide;
          b += k * k * 0.26 * lightSide;
        }
        // Note: sun with a soft corona.
        const cs = dir[0] * Ds[0] + dir[1] * Ds[1] + dir[2] * Ds[2];
        const sa = Math.acos(Math.min(1, cs));
        const disc = smooth(0.011, 0.008, sa);
        const corona = Math.exp(-sa * 14) * 0.35 + Math.exp(-sa * 55) * 0.8;
        r += disc * 1.5 + corona * 1.0;
        g += disc * 1.4 + corona * 0.82;
        b += disc * 1.2 + corona * 0.55;
        const i = (y * size + x) * 4;
        d[i] = Math.min(255, Math.sqrt(Math.min(1, r)) * 255);
        d[i + 1] = Math.min(255, Math.sqrt(Math.min(1, g)) * 255);
        d[i + 2] = Math.min(255, Math.sqrt(Math.min(1, b)) * 255);
        d[i + 3] = 255;
      }
    }
    ctxs[f].putImageData(images[f], 0, 0);
  }
  const tex = new THREE.CubeTexture(canvases);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return {
    texture: tex, canvases, sunDir: Ds, planetDir: Dp, hulls: packHulls(makeHulls(seed, Ds)),
  };
}
