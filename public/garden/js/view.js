// Note: render layer: turns world state into meshes, instances, lights, particles and animation.

import * as THREE from 'three';
import { N, PLANT_KINDS, GOOD_IDS, BALLOON_SCALE } from './config.js';
import { cidx, inB } from './island.js';
import { buildTerrain, buildUnder, buildWater, rockGeometry, crystalGeometry } from './terrain.js';
import { cloudGeo } from './sky.js';
import {
  MATS, makeFolk, plantGeometry, makeBuilding, makeStairs, makeScaffold, makeCrate, makeProp, makeBeret, makeArt, makeBunting, makeBalloon, makeDog, makeBird, makeButterfly, makeHen, makeSheep, makeFish, makeStrawHat, makeFisherHat, makePile, makeRelic,
  makeMemorialLantern, makeMemorialTree, buildLinkMesh, makeAirship, makeSpireStage, makeMemorial, SPIRE_HEIGHT,
} from './models.js';
import { knowRelic } from './econ.js';
import { rareDeposits } from './rareisles.js';
import { deedMemorials } from './legacy.js';
import { posAt, SHIP } from './ships.js';
import { addAccent, removeAccent } from './accents.js';
import { linkPos } from './links.js';
import { flightBase, flightSway } from './flight.js';
import { festivalPlace } from './art.js';
import { buildingYaw } from './spots.js';
import { hash2, clamp } from './rand.js';
import { makeFestivalSet } from './festival.js';

const hv = (i, j, k) => (hash2(i, j, k) % 1000) / 1000;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export const U_TIME = { value: 0 };
export const U_WIND = { value: 0.25 };
export const HAZE_COL = { value: new THREE.Color(0xcfe0ee) };

// Note: season weights (spring, summer, autumn, winter) and the plant snow level are shared by all materials.
export const U_SEASON = { value: new THREE.Vector4(1, 0, 0, 0) };
const U_SNOW_P = { value: 0 };

const SNOW_FN = `float sH(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float sN(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sH(i), sH(i + vec2(1.0, 0.0)), f.x), mix(sH(i + vec2(0.0, 1.0)), sH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const SNOW_FRAG = `{
  float snUp = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  float snT = sN(vWPos.xz * 1.1) * 0.6 + sN(vWPos.xz * 3.7) * 0.4;
  float snC = smoothstep(snT * 0.6, snT * 0.6 + 0.25, uSnow);
  float snA = snC * smoothstep(0.55, 0.85, snUp) * 0.8;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), snA);
}`;
const LEAF_FRAG = `{
  float lg = clamp((vColor.g - max(vColor.r, vColor.b)) * 5.0, 0.0, 1.0);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  float tu = clamp(uSeason.z * 1.3 - vLeafH * 0.3, 0.0, 1.0);
  vec3 ac = mix(vec3(0.9, 0.6, 0.15), vec3(0.78, 0.3, 0.12), fract(vLeafH * 3.7)) * (0.7 + lum * 1.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, ac, lg * tu * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 1.1 + 0.1) * vec3(0.9, 0.78, 0.6), lg * uSeason.w * 0.45);
  diffuseColor.rgb += lg * uSeason.x * vec3(0.02, 0.035, 0.0);
}`;

// Note: adds per-island haze, optional water ripple, plant sway, autumn leaf tint and snow to a standard material.
function patch(mat, o) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U_TIME; sh.uniforms.uWind = U_WIND; sh.uniforms.uHazeCol = HAZE_COL;
    if (o.haze) sh.uniforms.uHaze = o.haze;
    const wpos = o.snow || o.leaf;
    if (wpos) sh.uniforms.uSeason = U_SEASON;
    if (o.snow) sh.uniforms.uSnow = o.snow;
    sh.vertexShader = sh.vertexShader.replace('void main() {', `uniform float uTime; uniform float uWind;${wpos ? '\nvarying vec3 vWPos; varying float vLeafH;' : ''}\nvoid main() {`);
    if (o.sway) {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec4 ipos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ph = ipos.x * 0.8 + ipos.z * 0.6;
  float amt = min(position.y * position.y, 1.6);
  transformed.x += sin(uTime * 1.3 + ph) * uWind * amt * 0.2;
  transformed.z += cos(uTime * 1.0 + ph * 1.3) * uWind * amt * 0.12;
#endif`);
    }
    if (o.ripple) {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed.y += sin(uTime * 1.3 + position.x * 1.7 + position.z * 1.3) * 0.018;`);
    }
    if (wpos) {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 swp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  swp = instanceMatrix * swp;
  vLeafH = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
  vLeafH = 0.0;
#endif
  vWPos = (modelMatrix * swp).xyz;`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform vec3 uHazeCol;${o.haze ? '\nuniform float uHaze;' : ''}${wpos ? '\nuniform vec4 uSeason;\nvarying vec3 vWPos; varying float vLeafH;' : ''}${o.snow ? `\nuniform float uSnow;\n${SNOW_FN}` : ''}\nvoid main() {`);
    if (o.leaf) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${LEAF_FRAG}`);
    if (o.snow) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SNOW_FRAG}`);
    if (o.haze) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, uHaze);\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => `g${o.haze ? 'h' : ''}${o.sway ? 's' : ''}${o.ripple ? 'r' : ''}${o.leaf ? 'l' : ''}${o.snow ? 'n' : ''}`;
  return mat;
}

const DUMMY = new THREE.Object3D();
const TMPC = new THREE.Color();

class Plants {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();
    const mk = (o) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), { sway: true, snow: U_SNOW_P, ...o });
    this.mat = mk({ leaf: true });
    // Note: pines and glowcaps keep their colour all year; they only take snow.
    this.matEv = mk({});
  }

  get(key, geo) {
    let m = this.meshes.get(key);
    if (!m) {
      m = new THREE.InstancedMesh(geo, key.startsWith('pine|') || key.startsWith('glowcap|') ? this.matEv : this.mat, 1500);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0;
      this.scene.add(m);
      this.meshes.set(key, m);
    }
    return m;
  }

  rebuild(views) {
    for (const m of this.meshes.values()) m.count = 0;
    for (const v of views) {
      const isl = v.isl;
      if (!isl.revealed || v.appear < 0.02) continue;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const c = cidx(i, j);
          const p = isl.plant[c];
          if (!p) continue;
          const kind = PLANT_KINDS[p];
          const g = isl.grow[c];
          const variant = (hash2(i, j, 5) >> 3) & 3;
          const ripe = g >= 0.92 && (kind === 'bush' || kind === 'fruittree' || kind === 'wheat');
          const m = this.get(`${kind}|${variant}|${ripe ? 1 : 0}`, plantGeometry(kind, variant, ripe));
          if (m.count >= 1500) continue;
          const dx = (hv(i, j, 1) - 0.5) * 0.4; const dz = (hv(i, j, 2) - 0.5) * 0.4;
          const gg = Math.min(1, g);
          const s = (0.12 + 0.88 * (1 - (1 - gg) * (1 - gg))) * (0.92 + hv(i, j, 3) * 0.16) * smooth01(v.appear * 1.2);
          DUMMY.position.set(isl.wx + i + 0.5 - N / 2 + dx, isl.heightAt(i + 0.5 + dx, j + 0.5 + dz) - 0.02, isl.wz + j + 0.5 - N / 2 + dz);
          DUMMY.rotation.set(0, hv(i, j, 4) * 6.28, 0);
          DUMMY.scale.setScalar(s);
          DUMMY.updateMatrix();
          m.setMatrixAt(m.count++, DUMMY.matrix);
        }
      }
    }
    for (const m of this.meshes.values()) m.instanceMatrix.needsUpdate = true;
  }
}

// Note: rocks, exposed ore and crystals per island, rebuilt with the terrain.
class Props {
  constructor() {
    this.rockGeo = rockGeometry();
    this.crysGeo = crystalGeometry();
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
    this.crysMat = new THREE.MeshStandardMaterial({ color: 0x9deaff, emissive: 0x2a8fb0, emissiveIntensity: 0.7, flatShading: true, roughness: 0.25 });
  }

  build(isl) {
    const g = new THREE.Group();
    const rocks = []; const crys = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = cidx(i, j);
        if (!isl.mask[c]) continue;
        const x = i + 0.5 - N / 2; const z = j + 0.5 - N / 2;
        if (isl.stone[c] > 0 && isl.bld[c] < 0) {
          for (let k = 0; k < Math.min(3, isl.stone[c]); k++) rocks.push([x + (hv(i, j, 10 + k) - 0.5) * 0.7, z + (hv(i, j, 20 + k) - 0.5) * 0.7, 0.7 + hv(i, j, 30 + k) * 0.6, 0xa7a49f, hv(i, j, 40 + k) * 6.28]);
        }
        if (isl.dep[c] && isl.depAmt[c] > 0 && isl.depExposed(i, j)) {
          if (isl.dep[c] === 1) {
            for (let k = 0; k < 3; k++) rocks.push([x + (hv(i, j, 50 + k) - 0.5) * 0.8, z + (hv(i, j, 60 + k) - 0.5) * 0.8, 0.9 + hv(i, j, 70 + k) * 0.5, k === 2 ? 0xc27a4a : 0x7d625a, hv(i, j, 80 + k) * 6.28]);
          } else if (isl.dep[c] === 2) crys.push([x, z, 1.2 + hv(i, j, 90) * 0.6, hv(i, j, 91) * 6.28]);
        }
      }
    }
    const mk = (geo, mat, list, colored) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      m.castShadow = true; m.receiveShadow = true;
      list.forEach((r, n) => {
        const y = isl.heightAt(r[0] + N / 2, r[1] + N / 2) - 0.03;
        DUMMY.position.set(r[0], y, r[1]); DUMMY.rotation.set(0, colored ? r[4] : r[3], 0); DUMMY.scale.setScalar(r[2]); DUMMY.updateMatrix();
        m.setMatrixAt(n, DUMMY.matrix);
        if (colored) m.setColorAt(n, TMPC.set(r[3]));
      });
      m.frustumCulled = false;
      g.add(m);
    };
    mk(this.rockGeo, this.rockMat, rocks, true);
    mk(this.crysGeo, this.crysMat, crys, false);
    return g;
  }
}

function cloudMesh(mat) {
  const m = new THREE.Mesh(cloudGeo(Math.random, 1.6), mat);
  m.castShadow = false;
  return m;
}

const BEAM_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.07, 0.55, 20, 14, 1, true);
  g.translate(0, 10, 0);
  g.userData.shared = true;
  return g;
})();
const DEBRIS_GEO = new THREE.BoxGeometry(0.55, 0.05, 0.1);
DEBRIS_GEO.userData.shared = true;
const TILE_GEO = new THREE.BoxGeometry(0.2, 0.03, 0.16);
TILE_GEO.userData.shared = true;
const DEBRIS_MATS = [0x4a3a2e, 0x5a4636, 0x3b3a3c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));

// Note: a few boards and tiles around a storm-hit building; deterministic per building.
function makeDebris(b, dm) {
  const g = new THREE.Group();
  const n = dm.part === 'roof' ? 3 : 2;
  const r = b.size * 0.5 + 0.55;
  for (let k = 0; k < n + 2; k++) {
    const a = hv(b.x, b.y, 100 + k) * 6.28;
    const board = k < n;
    const m = new THREE.Mesh(board ? DEBRIS_GEO : TILE_GEO, DEBRIS_MATS[k % DEBRIS_MATS.length]);
    m.position.set(Math.cos(a) * (r + hv(b.x, b.y, 110 + k) * 0.5), 0.04, Math.sin(a) * (r + hv(b.x, b.y, 110 + k) * 0.5));
    m.rotation.set((hv(b.x, b.y, 120 + k) - 0.5) * 0.3, hv(b.x, b.y, 130 + k) * 6.28, (hv(b.x, b.y, 140 + k) - 0.5) * 0.25);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

class IslandView {
  constructor(wv, isl) {
    this.wv = wv; this.isl = isl;
    this.group = new THREE.Group();
    this.group.position.set(isl.wx, 0, isl.wz);
    this.hazeU = { value: isl.revealed ? 0 : 0.82 };
    this.appear = isl.revealed ? 1 : 0;
    const base = () => ({ vertexColors: true, flatShading: true, roughness: 0.93 });
    this.snowT = { value: 0 }; this.snowB = { value: 0 };
    this.terrainMat = patch(new THREE.MeshStandardMaterial(base()), { haze: this.hazeU, snow: this.snowT });
    this.underMat = patch(new THREE.MeshStandardMaterial(base()), { haze: this.hazeU });
    this.waterMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.8 }), { haze: this.hazeU, ripple: true });
    this.terrain = new THREE.Mesh(buildTerrain(isl), this.terrainMat);
    this.terrain.castShadow = true; this.terrain.receiveShadow = true; this.terrain.userData.isl = isl;
    this.under = new THREE.Mesh(buildUnder(isl), this.underMat);
    this.under.receiveShadow = true;
    this.water = new THREE.Mesh(buildWater(isl), this.waterMat);
    this.water.renderOrder = 1;
    this.group.add(this.terrain, this.under, this.water);
    this.props = null;
    this.vt = isl.ver.terrain; this.vw = isl.ver.water; this.tAge = Math.random() * 3; this.uAge = 0; this.wAge = 0;
    this.dirtyT = true; this.dirtyW = false;
    this.bviews = new Map();
    this.pileGroup = new THREE.Group();
    this.pileSig = '';
    this.group.add(this.pileGroup);
    this.relic = null; this.relicTaken = null;
    this.mem = []; this.memN = 0;
    this.dep = new THREE.Group(); this.depSig = ''; this.depT = 0; this.group.add(this.dep);
    this.deeds = new Map(); this.deedSig = null; this.deedT = 0; this.deedInit = false;
    this.dmg = new Map();
    this.bunting = null; this.buntSig = '';
    this.fireCells = []; this.fireT = 0; this.treeCells = [];
    this.fes = []; this.fesKey = '';
    // Note: snow-patched copies of the shared building materials, so only building meshes take roof snow.
    this.bmat = new Map([MATS.vertex, MATS.vertexDouble].map((m) => [m, patch(m.clone(), { snow: this.snowB })]));
    this.lights = []; // Note: light candidates {x,y,z,color,base,day}
    wv.scene.add(this.group);
    this.rebuildProps();
  }

  rebuildProps() {
    if (this.props) { this.group.remove(this.props); this.props.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
    this.props = this.isl.revealed ? this.wv.propsGen.build(this.isl) : null;
    if (this.props) this.group.add(this.props);
  }

  setRevealed() { this.rebuildProps(); this.dirtyT = true; }

  update(dt, time, nearCam) {
    const isl = this.isl;
    // Note: the Spire isle keeps a thin veil of mist even when revealed.
    const target = isl.revealed ? (isl.special === 'spire' ? 0.11 : 0) : 0.82;
    this.hazeU.value += (target - this.hazeU.value) * Math.min(1, dt * (isl.revealed ? 0.9 : 3));
    if (isl.revealed) this.appear = Math.min(1, this.appear + dt * 0.45);
    this.tAge += dt; this.uAge += dt; this.wAge += dt; this.t = time;
    if (isl.ver.terrain !== this.vt) { this.dirtyT = true; }
    if (this.dirtyT && this.tAge > 0.12) {
      this.dirtyT = false; this.vt = isl.ver.terrain; this.tAge = 0;
      this.terrain.geometry.dispose(); this.terrain.geometry = buildTerrain(isl);
      // Note: hull follows every top rebuild so the rim never lags behind edits.
      this.under.geometry.dispose(); this.under.geometry = buildUnder(isl);
      if (isl.revealed) this.rebuildProps();
    } else if (isl.revealed && nearCam && this.tAge > 3.5) {
      // Note: slow refresh picks up moisture, snow and fire colour changes.
      this.tAge = 0;
      this.terrain.geometry.dispose(); this.terrain.geometry = buildTerrain(isl);
      this.rebuildProps();
    }
    if (isl.ver.water !== this.vw && this.wAge > 0.18) {
      this.vw = isl.ver.water; this.wAge = 0;
      this.water.geometry.dispose(); this.water.geometry = buildWater(isl);
    }
    this.group.visible = true;
    if (!isl.revealed) return;
    this.syncBuildings(dt, time);
    this.syncRelic(time);
    this.syncMemorials();
    this.syncDeeds(dt, time);
    this.syncDeposits(dt);
    this.syncBunting();
    this.syncPiles(dt);
    this.syncFestival(dt, time, nearCam);
    this.collectLights();
  }

  bPos(b) {
    const isl = this.isl;
    return { x: b.x + b.size / 2 - N / 2, z: b.y + b.size / 2 - N / 2, y: isl.heightAt(b.x + b.size / 2, b.y + b.size / 2) };
  }

  // Note: shared with the sim (spots.js) so folk stand where the props are.
  bYaw(b) { return buildingYaw(this.isl, b); }

  // Note: dust puff, gold sparkle and chime when a building gains a tier.
  tierDone(b, bv, tier) {
    const fx = this.wv.fx; const isl = this.isl;
    const p = bv.g.position; const x = isl.wx + p.x; const z = isl.wz + p.z; const h = bv.obj.userData.height || 1.5;
    if (fx) {
      for (let k = 0; k < 7; k++) fx.puff(x, p.y, z, 0.8 + b.size * 0.25);
      for (let k = 0; k < 8 + tier * 3; k++) fx.sparkle(x + (Math.random() - 0.5) * b.size * 0.6, p.y + h * (0.3 + Math.random() * 0.6), z + (Math.random() - 0.5) * b.size * 0.6, 1);
    }
    if (this.wv.onTier) this.wv.onTier({ x, y: p.y, z }, tier, b);
  }

  // Note: swaps the shared vertex materials of one building for this island's snow copies.
  snowify(obj) {
    obj.traverse((o) => { if (o.isMesh) { const m = this.bmat.get(o.material); if (m) o.material = m; } });
  }

  // Note: seasonal festival set: fades in while the island hosts one, out when it ends; at most two sets overlap.
  syncFestival(dt, time, near) {
    const isl = this.isl; const wv = this.wv;
    const fe = isl.festival && isl.festival.season && isl.festival.at ? isl.festival : null;
    const key = fe ? `${fe.arch}|${fe.s}|${fe.at.i},${fe.at.j}` : '';
    if (key !== this.fesKey) {
      this.fesKey = key;
      for (const e of this.fes) e.want = 0;
      if (fe) {
        const set = makeFestivalSet(isl, fe, wv.world.known.has('ballooning'));
        if (set && set.ready) { set.group.visible = false; this.group.add(set.group); this.fes.push({ set, k: 0, want: 1 }); }
      }
    }
    if (!this.fes.length) return;
    const wd = wv.world.weather.wind;
    const c = { fx: wv.fx, dt, near, wx: isl.wx, wz: isl.wz, wind: U_WIND.value, windx: wd.x, windz: wd.z };
    for (let n = this.fes.length - 1; n >= 0; n--) {
      const e = this.fes[n];
      e.k = clamp(e.k + (e.want ? dt * 0.5 : -dt * 0.35), 0, 1);
      if (!e.want && e.k <= 0) {
        this.group.remove(e.set.group);
        e.set.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
        if (e.set.dispose) e.set.dispose();
        this.fes.splice(n, 1);
        continue;
      }
      const k = smooth01(e.k);
      e.set.group.visible = k > 0.01;
      e.set.group.position.y = -(1 - k) * 0.7;
      e.set.update(time, k, c);
    }
  }

  syncBuildings(dt, time) {
    const isl = this.isl;
    const live = new Set();
    for (const b of isl.buildings) {
      if (!b || b.gone) continue;
      live.add(b);
      let bv = this.bviews.get(b);
      if (!bv) {
        const g = new THREE.Group();
        const p = this.bPos(b);
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = this.bYaw(b);
        this.group.add(g);
        bv = { g, obj: null, scaf: null, lvl: -1, tier: 0, built: null, pop: 0, born: 0, tierT: -9 };
        this.bviews.set(b, bv);
      }
      let rise = 0;
      if (b.id === 'stairs') rise = Math.max(0.3, isl.heightAt(b.x + b.dx + 0.5, b.y + b.dz + 0.5) - isl.heightAt(b.x + 0.5, b.y + 0.5));
      const tier = Math.min(4, b.flourish | 0);
      if (bv.built !== !!b.built || bv.lvl !== b.level || (b.built && bv.tier !== tier) || (b.id === 'stairs' && Math.abs(bv.rise - rise) > 0.25)) {
        if (bv.obj) bv.g.remove(bv.obj);
        const was = bv.built; const oldTier = bv.tier;
        bv.rise = rise;
        bv.obj = b.id === 'stairs' ? makeStairs(rise) : b.id === 'art' ? makeArt(b) : makeBuilding(b.id, b.level, b.seed, b.built ? tier : 0);
        this.snowify(bv.obj);
        bv.g.add(bv.obj);
        bv.built = !!b.built; bv.lvl = b.level; bv.tier = tier;
        if (!b.built && !bv.scaf) { bv.scaf = makeScaffold(b.size); bv.g.add(bv.scaf); }
        if (b.built && bv.scaf) { bv.g.remove(bv.scaf); bv.scaf = null; }
        if (b.built && was === false) bv.pop = 0.6;
        if (b.built && was === true) bv.pop = 0.35;
        const p = this.bPos(b);
        bv.g.position.set(p.x, p.y, p.z);
        bv.g.rotation.y = this.bYaw(b);
        // Note: only a rising tier of an already built view counts; first creation and restore stay silent.
        if (b.built && was === true && tier > oldTier && time - bv.tierT >= 1) { bv.tierT = time; this.tierDone(b, bv, tier); }
      }
      const ud = bv.obj.userData;
      bv.born = Math.min(1, bv.born + dt * 1.5);
      let sy = 1; let sxz = 1;
      if (!b.built) { sy = 0.05 + 0.95 * smooth01(b.progress); bv.obj.visible = b.progress > 0.02; }
      else if (bv.pop > 0) { bv.pop = Math.max(0, bv.pop - dt); const k = bv.pop / 0.6; sy = 1 + Math.sin(k * Math.PI * 2) * 0.08 * k; sxz = 1 - Math.sin(k * Math.PI * 2) * 0.03 * k; }
      if (b.id === 'art' && b.growth < 1) { const g = smooth01(b.growth); sy = 0.05 + 0.95 * g; sxz = 0.55 + 0.45 * g; }
      bv.obj.scale.set(sxz, sy * smooth01(bv.born * 1.4), sxz);
      if (b.id === 'art' && b.kind !== 'doodle') bv.obj.rotation.z = Math.min(0.14, (b.wear || 0) * 0.16) * (1 + (b.x % 2) * -2);
      if (ud.update) ud.update(time, U_WIND.value);
      if ((b.id === 'campfire' || b.id === 'bonfire') && ud.flame) ud.flame.visible = b.lit !== false;
      if (ud.spin) ud.spin.rotation.z += dt * (0.25 + U_WIND.value * 3.2);
      bv.working = !!b.working;
      if (b.id === 'greatwork') this.syncSpire(b, bv, dt, time);
      this.syncDamage(b, bv);
    }
    for (const [b, bv] of this.bviews) {
      if (!live.has(b)) { this.group.remove(bv.g); this.bviews.delete(b); }
    }
  }

  // Note: Great Work pieces rise onto the greatwork building by gw.stage; the crown and beacon follow gw.lit.
  syncSpire(b, bv, dt, time) {
    const w = this.wv.world; const gw = w.gw;
    const stage = gw && gw.stage ? gw.stage : [];
    const lit = !!(gw && gw.lit);
    let sp = bv.spire;
    if (!b.built) {
      if (sp) { for (const pc of sp.pieces.values()) bv.obj.remove(pc.o); if (sp.beam) bv.g.remove(sp.beam); bv.spire = null; }
      return;
    }
    if (!sp || sp.obj !== bv.obj) {
      if (sp && sp.beam) bv.g.remove(sp.beam);
      sp = bv.spire = { obj: bv.obj, pieces: new Map(), beam: null, sig: null, beamK: sp ? sp.beamK : 0 };
    }
    const want = [];
    for (let k = 1; k <= 6; k++) if (stage[k]) want.push(k);
    if (lit) want.push(7);
    const sig = want.join(',');
    if (sig !== sp.sig) {
      for (const k of want) {
        if (sp.pieces.has(k)) continue;
        const o = makeSpireStage(k);
        this.snowify(o);
        bv.obj.add(o);
        // Note: only a piece that was not there before animates; first creation and restore stay silent.
        const fresh = !!bv.spireSeen && !bv.spireSeen.has(k);
        sp.pieces.set(k, { o, age: fresh ? 0 : 1, k });
        if (!fresh) continue;
        const fx = this.wv.fx; const p = bv.g.position;
        if (fx) for (let n = 0; n < 16; n++) fx.sparkle(this.isl.wx + p.x + (Math.random() - 0.5) * 1.4, p.y + SPIRE_HEIGHT * (k / 7) + Math.random() * 0.6, this.isl.wz + p.z + (Math.random() - 0.5) * 1.4, 1.2);
      }
      for (const [k, pc] of sp.pieces) if (!want.includes(k)) { bv.obj.remove(pc.o); sp.pieces.delete(k); }
      bv.spireSeen = new Set(want); sp.sig = sig;
    }
    for (const pc of sp.pieces.values()) {
      if (pc.age >= 1) { if (pc.o.scale.y !== 1) { pc.o.scale.set(1, 1, 1); pc.o.position.y = 0; } continue; }
      pc.age = Math.min(1, pc.age + dt * 0.7);
      const e = 1 - Math.pow(1 - pc.age, 3);
      pc.o.position.y = -(1 - e) * 1.5;
      pc.o.scale.set(0.85 + 0.15 * e, 0.3 + 0.7 * e, 0.85 + 0.15 * e);
      const fx = this.wv.fx;
      if (fx && Math.random() < dt * 14) { const p = bv.g.position; fx.sparkle(this.isl.wx + p.x + (Math.random() - 0.5), p.y + SPIRE_HEIGHT * (pc.k / 7) * e + 0.3, this.isl.wz + p.z + (Math.random() - 0.5), 0.8); }
    }
    // Note: the beacon is one additive cone above the crown; it swells in over a few seconds and pulses slowly.
    if (lit) {
      if (!sp.beam) {
        sp.beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        sp.beam.position.set(0, SPIRE_HEIGHT + 0.2, 0);
        sp.beam.frustumCulled = false;
        bv.g.add(sp.beam);
      }
      sp.beamK = Math.min(1, sp.beamK + dt * 0.35);
      const night = w.night || 0;
      const pulse = 1 + Math.sin(time * 1.7) * 0.14 + Math.sin(time * 4.3) * 0.05;
      sp.beam.material.opacity = smooth01(sp.beamK) * (0.07 + 0.12 * night) * pulse;
      sp.beam.scale.set(1 + Math.sin(time * 0.9) * 0.05, 1, 1 + Math.sin(time * 0.9) * 0.05);
    } else if (sp.beam) { bv.g.remove(sp.beam); sp.beam.material.dispose(); sp.beam = null; sp.beamK = 0; }
  }

  // Note: storm damage cue per building: a tilted roof and scattered boards until the repair ends.
  syncDamage(b, bv) {
    const dm = this.dmg.get(b);
    const tiltable = b.id !== 'art' && b.id !== 'stairs';
    if (dm && !bv.dm) {
      bv.dm = makeDebris(b, dm);
      bv.g.add(bv.dm);
      const fx = this.wv.fx; const p = bv.g.position;
      if (fx) for (let k = 0; k < 8; k++) fx.dust(this.isl.wx + p.x, p.y + 0.3, this.isl.wz + p.z, 0.6, 0.55, 0.5);
    } else if (!dm && bv.dm) {
      bv.g.remove(bv.dm); bv.dm = null;
      if (tiltable) bv.obj.rotation.set(0, 0, 0);
      const fx = this.wv.fx; const p = bv.g.position;
      if (fx) for (let k = 0; k < 8; k++) fx.sparkle(this.isl.wx + p.x + (Math.random() - 0.5) * b.size * 0.6, p.y + 0.4 + Math.random(), this.isl.wz + p.z + (Math.random() - 0.5) * b.size * 0.6, 1);
    }
    if (dm && tiltable && dm.part === 'roof') bv.obj.rotation.set(0.025, 0, 0.055);
  }

  syncRelic(time) {
    const isl = this.isl;
    const r = knowRelic(isl);
    if (!r) return;
    if (!this.relic) {
      this.relic = makeRelic(r.know);
      this.relic.position.set(r.i + 0.5 - N / 2, isl.heightAt(r.i + 0.5, r.j + 0.5) - 0.03, r.j + 0.5 - N / 2);
      this.relic.rotation.y = hv(r.i, r.j, 7) * 6.28;
      this.group.add(this.relic);
    }
    if (this.relicTaken !== !!r.taken) {
      this.relicTaken = !!r.taken;
      this.relic.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial) o.visible = !r.taken; });
    }
  }

  // Note: garland poles stand in a gapped ring around the festival place; one more string per rung.
  syncBunting() {
    const isl = this.isl;
    const sig = `${isl.rung}|${isl.buildings.length}|${isl.buildings.filter((b) => b && !b.gone && b.id === 'hall').length}`;
    if (sig === this.buntSig) return;
    this.buntSig = sig;
    if (this.bunting) { this.group.remove(this.bunting); this.bunting = null; }
    if (isl.rung < 2 || !isl.buildings.some((b) => b && !b.gone && b.built && b.id === 'storehouse')) return;
    const at = festivalPlace(isl);
    const n = isl.rung + 1;
    const poles = [];
    for (let k = 0; k < n; k++) {
      const a = 0.5 + (k / n) * (Math.PI * 2 - 1.1);
      const i = Math.round(at.i + Math.cos(a) * 2.4); const j = Math.round(at.j + Math.sin(a) * 2.4);
      const ok = inB(i, j) && isl.walkable(i, j) && isl.bld[cidx(i, j)] < 0;
      poles.push(ok ? { x: i + 0.5 - N / 2, y: isl.heightAt(i + 0.5, j + 0.5), z: j + 0.5 - N / 2 } : null);
    }
    const run = [];
    const runs = [];
    for (const p of poles) { if (p) run.push(p); else if (run.length) { runs.push([...run]); run.length = 0; } }
    if (run.length) runs.push(run);
    const g = new THREE.Group();
    for (const r of runs) if (r.length > 1) g.add(makeBunting(r, isl.rung));
    this.bunting = g;
    this.group.add(g);
  }

  syncMemorials() {
    const m = this.isl.memorials || [];
    if (m.length === this.memN) return;
    for (let k = this.memN; k < m.length; k++) {
      const e = m[k];
      const o = e.kind === 'tree' ? makeMemorialTree() : makeMemorialLantern();
      o.position.set(e.i + 0.5 - N / 2 + (hv(e.i, e.j, 3) - 0.5) * 0.4, this.isl.heightAt(e.i + 0.5, e.j + 0.5) - 0.02, e.j + 0.5 - N / 2 + (hv(e.i, e.j, 4) - 0.5) * 0.4);
      o.rotation.y = hv(e.i, e.j, 6) * 6.28;
      this.group.add(o);
      this.mem.push(o);
    }
    this.memN = m.length;
  }

  // Note: deed memorials stand on their own cells; a new one rises with sparkles, existing ones appear silently.
  syncDeeds(dt, time) {
    const w = this.wv.world;
    this.deedT -= dt;
    if (this.deedT <= 0 || this.deedSig === null) {
      this.deedT = 0.5;
      let list = [];
      try { list = w.deeds ? deedMemorials(w, this.isl.id) : []; } catch (e) { list = []; }
      const sig = list.map((m) => `${m.kind}@${m.x},${m.z}`).join('|');
      if (sig !== this.deedSig) {
        const keep = new Set();
        for (const m of list) {
          const key = `${m.kind}@${m.x},${m.z}`;
          keep.add(key);
          if (this.deeds.has(key)) continue;
          let o = null;
          try { o = makeMemorial(m.kind); } catch (e) { continue; }
          this.snowify(o);
          this.group.add(o);
          o.rotation.y = hv(m.x, m.z, 9) * 6.28;
          this.deeds.set(key, { o, m, age: this.deedInit ? 0 : 1 });
        }
        for (const [key, e] of this.deeds) if (!keep.has(key)) { this.group.remove(e.o); this.deeds.delete(key); }
        this.deedSig = sig; this.deedInit = true;
      }
    }
    const fx = this.wv.fx;
    for (const e of this.deeds.values()) {
      const m = e.m;
      const y = this.isl.heightAt(m.x + 0.5, m.z + 0.5) - 0.02;
      const px = m.x + 0.5 - N / 2; const pz = m.z + 0.5 - N / 2;
      if (e.age < 1) {
        e.age = Math.min(1, e.age + dt * 0.6);
        const k = smooth01(e.age);
        e.o.scale.set(0.6 + 0.4 * k, 0.05 + 0.95 * k, 0.6 + 0.4 * k);
        if (fx && Math.random() < dt * 12) fx.sparkle(this.isl.wx + px + (Math.random() - 0.5) * 0.8, y + 0.3 + Math.random() * 1.6 * k, this.isl.wz + pz + (Math.random() - 0.5) * 0.8, 1);
      } else if (e.o.scale.y !== 1) e.o.scale.set(1, 1, 1);
      e.o.position.set(px, y, pz);
    }
  }

  // Note: one small pile marks each live rare deposit; it shrinks as the stock is gathered.
  syncDeposits(dt) {
    const isl = this.isl;
    if (!isl.rare) return;
    this.depT -= dt;
    if (this.depT > 0) return;
    this.depT = 0.5;
    const deps = rareDeposits(isl);
    const sig = deps.map((d) => `${d.i},${d.j},${d.n}`).join(';');
    if (sig === this.depSig) return;
    this.depSig = sig;
    while (this.dep.children.length) this.dep.remove(this.dep.children[0]);
    for (const d of deps) {
      const p = makePile(d.good, Math.max(1, Math.min(4, d.n)));
      p.position.set(d.i + 0.5 - N / 2, isl.heightAt(d.i + 0.5, d.j + 0.5) - 0.02, d.j + 0.5 - N / 2);
      p.rotation.y = hv(d.i, d.j, 12) * 6.28;
      this.dep.add(p);
    }
    this.depList = deps;
  }

  syncPiles(dt) {
    const isl = this.isl;
    const store = isl.buildings.find((b) => b && !b.gone && b.id === 'storehouse' && b.built);
    // Note: the Spire isle has no storehouse; its goods wait around the Great Work.
    const sv = store || (isl.special === 'spire' ? isl.buildings.find((b) => b && !b.gone && b.id === 'greatwork' && b.built) : null);
    let sig = '';
    if (sv) for (const g of GOOD_IDS) { const n = isl.stock[g] | 0; if (n > 0) sig += `${g}${Math.min(12, n)},`; }
    if (sig === this.pileSig) return;
    this.pileSig = sig;
    while (this.pileGroup.children.length) this.pileGroup.remove(this.pileGroup.children[0]);
    if (!sv) return;
    const cx = sv.x + sv.size / 2; const cz = sv.y + sv.size / 2;
    const dd = sv.door ? Math.atan2(sv.door.i + 0.5 - cx, sv.door.j + 0.5 - cz) : 0;
    const slots = [];
    const grow = store ? 0 : Math.max(0, (sv.size - 2) * 0.5) + 0.4;
    // Note: three rings give room for all 39 goods.
    for (const [rad, n, off] of [[1.65, 11, 0.3], [2.3, 15, 0.1], [2.95, 18, 0.2]]) {
      for (let k = 0; k < n; k++) {
        const a = dd + 0.5 + (k / n) * (Math.PI * 2 - 1.0) + off;
        slots.push([cx + Math.sin(a) * (rad + grow), cz + Math.cos(a) * (rad + grow), a]);
      }
    }
    let s = 0;
    for (const g of GOOD_IDS) {
      const n = isl.stock[g] | 0;
      if (n <= 0 || s >= slots.length) continue;
      let sl = slots[s++];
      let guard = 0;
      while (guard++ < 6 && (!isl.land(Math.floor(sl[0]), Math.floor(sl[1])) || isl.water[cidx(clamp(Math.floor(sl[0]), 0, N - 1), clamp(Math.floor(sl[1]), 0, N - 1))] > 0.2) && s < slots.length) sl = slots[s++];
      if (!isl.land(Math.floor(sl[0]), Math.floor(sl[1]))) continue;
      const p = makePile(g, Math.min(12, n));
      p.position.set(sl[0] - N / 2, isl.heightAt(sl[0], sl[1]) - 0.02, sl[1] - N / 2);
      p.rotation.y = sl[2];
      this.pileGroup.add(p);
    }
  }

  collectLights() {
    const out = this.lights; out.length = 0;
    const isl = this.isl;
    for (const [b, bv] of this.bviews) {
      if (!b.built || !bv.obj) continue;
      const ud = bv.obj.userData;
      // Note: flourish lanterns burn every night, whatever the building does.
      // Note: very subtle slow flicker (+-6%) with a per-lamp phase from its local position.
      if (ud.lamps) for (const l of ud.lamps) {
        const lw = bv.obj.localToWorld(l.clone());
        const ph = (l.x * 12.9 + l.y * 4.1 + l.z * 7.7) * 3 + b.x * 0.7 + b.y * 1.3;
        const fl = 1 + Math.sin((this.t || 0) * 2.3 + ph) * 0.04 + Math.sin((this.t || 0) * 5.1 + ph * 1.7) * 0.02;
        out.push({ x: lw.x, y: lw.y, z: lw.z, color: 0xffd48a, base: 0.4 * fl, day: 0, lamp: true });
      }
      if (!ud.glow) continue;
      const on = ((b.id === 'campfire' || b.id === 'bonfire') && b.lit !== false) || b.id === 'hall' || b.working || b.id === 'lampworks' || b.id === 'hut';
      if (!on) continue;
      const w = bv.obj.localToWorld(ud.glow.clone());
      out.push({ x: w.x, y: w.y, z: w.z, color: ud.glowColor || 0xffb060, base: b.id === 'bonfire' ? 1.8 : b.id === 'campfire' ? 1.1 : b.id === 'hut' ? 0.45 : 0.8, day: b.id === 'campfire' || b.id === 'bonfire' ? 0.35 : 0 });
    }
    // Note: link end lanterns light the island at their end; span lamps and string lights are self-lit meshes.
    for (const [l, lv] of this.wv.linkViews) {
      const lp = lv.obj.userData.lamps;
      const end = l.a === isl.id ? 0 : l.b === isl.id ? 1 : -1;
      if (end < 0 || !lp || lp.length !== 2) continue;
      const q = lp[end];
      const ph = (q.x * 12.9 + q.y * 4.1 + q.z * 7.7) * 3;
      const fl = 1 + Math.sin((this.t || 0) * 2.3 + ph) * 0.04 + Math.sin((this.t || 0) * 5.1 + ph * 1.7) * 0.02;
      out.push({ x: q.x, y: q.y, z: q.z, color: 0xffd48a, base: 0.4 * fl, day: 0, lamp: true });
    }
    const kr = knowRelic(isl);
    if (kr && !kr.taken && this.relic) {
      const u = this.relic.userData;
      const w = this.relic.localToWorld(u.glow.clone());
      out.push({ x: w.x, y: w.y, z: w.z, color: u.glowColor, base: 0.6, day: 0.15 });
    }
    for (const e of this.fes) {
      if (e.k < 0.05) continue;
      for (const l of e.set.lights) out.push({ x: isl.wx + l.x, y: l.y, z: isl.wz + l.z, color: l.color, base: l.base * e.k, day: l.day * e.k });
    }
    for (const e of this.deeds.values()) {
      const lp = e.o.userData.lamps;
      if (!lp || e.age < 0.6) continue;
      e.o.updateMatrixWorld(true);
      for (const l of lp) {
        const lw = e.o.localToWorld(l.clone());
        const ph = (l.x * 12.9 + l.y * 4.1 + l.z * 7.7) * 3;
        const fl = 1 + Math.sin((this.t || 0) * 2.3 + ph) * 0.04;
        out.push({ x: lw.x, y: lw.y, z: lw.z, color: 0xffd48a, base: 0.35 * fl, day: 0, lamp: true });
      }
    }
    for (const bv of this.bviews.values()) {
      const sp = bv.spire;
      if (!sp || !sp.beam) continue;
      const p = bv.g.position;
      out.push({ x: isl.wx + p.x, y: p.y + SPIRE_HEIGHT + 0.5, z: isl.wz + p.z, color: 0xffe2a0, base: 1.5 * smooth01(sp.beamK), day: 0.3 });
    }
    for (const o of this.mem) {
      if (!o.userData.glow) continue;
      const w = o.localToWorld(o.userData.glow.clone());
      out.push({ x: w.x, y: w.y, z: w.z, color: o.userData.glowColor, base: 0.35, day: 0 });
    }
  }

  dispose() {
    this.wv.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    this.terrainMat.dispose(); this.underMat.dispose(); this.waterMat.dispose();
    for (const m of this.bmat.values()) m.dispose();
    for (const e of this.fes) if (e.set.dispose) e.set.dispose();
  }
}

// Note: a plain sleeping mat; the sleeper lies toward -z from the group origin.
// Note: buildings whose chimney keeps a low wisp at night even when idle.
const LEAF_COLS = [[0.92, 0.6, 0.18], [0.82, 0.34, 0.14], [0.9, 0.74, 0.28], [0.7, 0.3, 0.12]];
const PLUME_NIGHT = new Set(['smithy', 'smelter', 'brickkiln', 'oven', 'smokehouse', 'hut']);
const BED_GEO = new THREE.BoxGeometry(0.52, 0.03, 0.7);
const BED_COLS = [0xc7766a, 0x6a96c7, 0xc7a85a, 0x7fb08a, 0x9a7fbf];
function makeBedroll(id) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(BED_GEO, new THREE.MeshStandardMaterial({ color: BED_COLS[id % BED_COLS.length], roughness: 1, flatShading: true }));
  m.position.set(0, 0.015, -0.4); m.receiveShadow = true;
  g.add(m);
  return g;
}

const STAGE_ANIM = {
  walk(r, t) {
    const s = Math.sin(t * 9);
    r.legL.rotation.x = s * 0.75; r.legR.rotation.x = -s * 0.75;
    r.armL.rotation.x = -s * 0.6; r.armR.rotation.x = s * 0.6;
    r.body.position.y = r.base + Math.abs(Math.cos(t * 9)) * 0.03;
  },
  carry(r, t) {
    const s = Math.sin(t * 9);
    r.legL.rotation.x = s * 0.7; r.legR.rotation.x = -s * 0.7;
    r.armL.rotation.x = -1.15; r.armR.rotation.x = -1.15;
    r.body.position.y = r.base + Math.abs(Math.cos(t * 9)) * 0.025;
  },
  cradle(r, t) {
    r.armL.rotation.x = -1.0; r.armR.rotation.x = -1.0; r.armL.rotation.z = 0.28; r.armR.rotation.z = -0.28;
    r.head.rotation.x = 0.4; r.head.rotation.y = Math.sin(t * 0.8) * 0.2;
    r.body.rotation.z = Math.sin(t * 1.6) * 0.03;
  },
  idle(r, t) {
    r.armL.rotation.x = Math.sin(t * 1.4) * 0.05; r.armR.rotation.x = -Math.sin(t * 1.4) * 0.05;
    r.head.rotation.y = Math.sin(t * 0.6) * 0.35;
    r.body.position.y = r.base + Math.sin(t * 1.8) * 0.006;
  },
  work(r, t) {
    r.armR.rotation.x = -1.2 + Math.sin(t * 8) * 0.8; r.armL.rotation.x = -0.7 + Math.sin(t * 8 + 1.6) * 0.3;
    r.body.rotation.x = 0.12 + Math.sin(t * 8) * 0.05;
  },
  gaze(r, t, f) {
    r.head.rotation.x = -0.28; r.head.rotation.y = Math.sin(t * 0.5) * 0.12;
    const why = f.task && f.task.spot && f.task.spot.why;
    if (why === 'far' || why === 'relic' || why === 'dep' || why === 'place') { r.armR.rotation.z = -2.5; r.armR.rotation.x = Math.sin(t * 6) * 0.25; }
    else { r.armL.rotation.x = -0.5; r.armR.rotation.x = -0.1; }
  },
  slump(r, t) {
    r.body.rotation.x = 0.38; r.head.rotation.x = 0.55; r.head.rotation.y = Math.sin(t * 0.5) * 0.15;
    r.armL.rotation.x = 0.15; r.armR.rotation.x = 0.15;
    r.body.position.y = r.base - 0.02 + Math.sin(t * 1.1) * 0.006;
  },
  // Note: turns the tool over, then shrugs; one 4.5 s cycle.
  shrug(r, t) {
    const c = t % 4.5;
    if (c < 2.4) {
      r.armR.rotation.x = -1.3; r.armR.rotation.z = Math.sin(c / 2.4 * Math.PI * 2) * 1.1;
      r.armL.rotation.x = -0.4; r.head.rotation.x = 0.35; r.head.rotation.y = Math.sin(c * 2) * 0.1;
    } else {
      const k = Math.sin((c - 2.4) / 2.1 * Math.PI);
      r.armL.rotation.z = 0.9 * k; r.armR.rotation.z = -0.9 * k; r.armL.rotation.x = -0.3 * k; r.armR.rotation.x = -0.3 * k;
      r.head.rotation.z = 0.2 * k; r.body.position.y = r.base + 0.03 * k;
    }
  },
  sit(r, t) {
    r.body.position.y = r.base * 0.55;
    r.legL.rotation.x = -1.45; r.legR.rotation.x = -1.45;
    r.legL.position.y = r.base * 0.55; r.legR.position.y = r.base * 0.55;
    r.armL.rotation.x = -0.4 + Math.sin(t * 0.9) * 0.05; r.armR.rotation.x = -0.4;
    r.head.rotation.y = Math.sin(t * 0.4) * 0.5;
  },
  sitEat(r, t) {
    STAGE_ANIM.sit(r, t);
    r.armR.rotation.x = -2.0 + Math.sin(t * 4) * 0.25; r.armL.rotation.x = -0.9;
    r.head.rotation.x = Math.sin(t * 4) * 0.06;
  },
  eat(r, t) {
    r.armR.rotation.x = -2.2 + Math.sin(t * 5) * 0.2; r.armL.rotation.x = -1.0;
    r.head.rotation.x = Math.sin(t * 5) * 0.08;
  },
  plant(r, t) {
    r.body.rotation.x = 0.75 + Math.sin(t * 5) * 0.06;
    r.armL.rotation.x = -1.6 + Math.sin(t * 5) * 0.25; r.armR.rotation.x = -1.6 - Math.sin(t * 5) * 0.25;
    r.head.rotation.x = -0.3;
  },
  // Note: cast over 1.2 s, wait with a sway, then yank the rod back in the last second.
  fish(r, t, f) {
    const tk = f && f.task; const tot = tk && tk.total || 8;
    const el = tk && tk.total ? tot - tk.t : 3;
    let a = -0.95 + Math.sin(t * 1.5) * 0.04; let lean = 0.06;
    if (el < 1.2) { const k = el / 1.2; a = -2.7 + 1.75 * Math.sin(k * Math.PI / 2); lean = -0.1 + 0.16 * k; }
    else if (el > tot - 1.0) { const k = (el - (tot - 1.0)); a = -0.95 - 0.7 * Math.sin(Math.min(1, k) * Math.PI); lean = -0.12 * Math.sin(Math.min(1, k) * Math.PI); }
    r.armR.rotation.x = a; r.armL.rotation.x = a * 0.7 - 0.2;
    r.body.rotation.x = lean;
  },
  // Note: tier jobs: pour from a can with the left hand on the hip, and wipe a wall with a rag.
  water(r, t) {
    const s = Math.sin(t * 1.6);
    r.body.rotation.x = 0.18;
    r.armR.rotation.x = -1.0 - s * 0.12; r.armR.rotation.z = -0.15;
    r.armL.rotation.z = 0.5; r.armL.rotation.x = -0.1;
    r.head.rotation.x = 0.25;
  },
  tidy(r, t) {
    const s = Math.sin(t * 6);
    r.armR.rotation.x = -2.2 + Math.sin(t * 2.3) * 0.12; r.armR.rotation.z = -0.35 + s * 0.3;
    r.armL.rotation.x = -0.35; r.armL.rotation.z = 0.2;
    r.body.rotation.x = 0.06;
    r.head.rotation.x = -0.12;
  },
  dance(r, t) {
    const s = Math.sin(t * 5);
    r.armL.rotation.x = -2.6 + s * 0.4; r.armR.rotation.x = -2.6 - s * 0.4;
    r.armL.rotation.z = 0.3; r.armR.rotation.z = -0.3;
    r.legL.rotation.x = s * 0.35; r.legR.rotation.x = -s * 0.35;
    r.body.position.y = r.base + Math.abs(Math.sin(t * 5)) * 0.07;
    r.head.rotation.z = s * 0.12;
  },
  sleep() {},
};

// Note: a slack mooring line drawn as two thin segments with a droop at the middle.
const ROPE_MAT = new THREE.MeshLambertMaterial({ color: 0x7a5a30 });
const ROPE_GEO = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).translate(0, 0.5, 0);
const ROPE_UP = new THREE.Vector3(0, 1, 0);
const ropeD = new THREE.Vector3();
const ropeV1 = new THREE.Vector3();
const ropeV2 = new THREE.Vector3();
const ropeV3 = new THREE.Vector3();
class Rope {
  constructor(scene) {
    this.scene = scene;
    this.segs = [new THREE.Mesh(ROPE_GEO, ROPE_MAT), new THREE.Mesh(ROPE_GEO, ROPE_MAT)];
    this.mid = new THREE.Vector3();
    for (const m of this.segs) { m.castShadow = false; scene.add(m); }
  }

  set(a, b) {
    const len = a.distanceTo(b);
    this.mid.addVectors(a, b).multiplyScalar(0.5);
    this.mid.y -= Math.min(0.25, len * 0.12);
    this.seg(this.segs[0], a, this.mid);
    this.seg(this.segs[1], this.mid, b);
  }

  seg(m, a, b) {
    ropeD.subVectors(b, a);
    const l = ropeD.length();
    m.visible = l > 1e-3;
    if (!m.visible) return;
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(ROPE_UP, ropeD.divideScalar(l));
    m.scale.set(1, l, 1);
  }

  dispose() { for (const m of this.segs) this.scene.remove(m); }
}

// Note: shared satchel mesh parts for explorers.
const SATCHEL_GEO = new THREE.BoxGeometry(0.07, 0.09, 0.04);
const SATCHEL_MAT = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });

const ANIMAL_SCALE = { dog: 0.5, sheep: 0.8, hen: 0.625, bird: 0.6, butterfly: 0.35, fish: 0.5 };

export class WorldView {
  constructor(scene, world, fx, opts = {}) {
    this.scene = scene; this.world = world; this.fx = fx;
    this.onTier = opts.onTier || null;
    this.propsGen = new Props();
    this.plants = new Plants(scene);
    this.views = new Map();
    this.folkViews = new Map();
    this.animalViews = new Map();
    this.linkViews = new Map();
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa8, roughness: 1, transparent: true, opacity: 0.92 });
    this.snowMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 1, transparent: true, opacity: 0.92 });
    this.wxClouds = new Map();
    this.lightPool = [];
    const nl = opts.lights ?? 16;
    for (let k = 0; k < nl; k++) { const l = new THREE.PointLight(0xffb060, 0, 9, 1.6); l.castShadow = false; scene.add(l); this.lightPool.push(l); }
    this.plantT = 0; this.effT = 0; this.time = 0;
    this.shipViews = new Map(); this.shipLights = []; this.extraWind = 0;
    this.revealQueue = [];
    this.ensureViews();
  }

  ensureViews() {
    for (const isl of this.world.islands.values()) if (!this.views.has(isl.id)) this.views.set(isl.id, new IslandView(this, isl));
  }

  onReveal(isl) {
    const v = this.views.get(isl.id);
    if (v) v.setRevealed();
  }

  terrainMeshes() {
    const out = [];
    for (const v of this.views.values()) if (v.isl.revealed) out.push(v.terrain);
    return out;
  }

  viewOf(id) { return this.views.get(id); }

  update(dt, camTarget, cam, sky, hazeColor) {
    this.time += dt;
    U_TIME.value = this.time;
    const w = this.world;
    U_WIND.value = 0.1 + w.weather.wind.s * 0.8 + this.extraWind;
    HAZE_COL.value.copy(hazeColor).multiplyScalar(0.96);
    this.syncSeason();
    if (this.views.size !== w.islands.size) this.ensureViews();
    const near = (isl) => Math.hypot(isl.wx - camTarget.x, isl.wz - camTarget.z) < 62;
    for (const v of this.views.values()) v.update(dt, this.time, near(v.isl));
    this.plantT -= dt;
    if (this.plantT <= 0) { this.plantT = 0.5; this.plants.rebuild(this.views.values()); }
    this.syncFolk(dt);
    this.syncAnimals(dt);
    this.syncLinks(dt);
    this.syncArrivals(dt);
    this.syncShips(dt);
    this.syncWeather(dt);
    this.effects(dt, camTarget);
    this.syncLights(camTarget, cam);
  }

  // Note: season weights drive the leaf tint, snow level and a faint ground tint; all cheap uniforms.
  syncSeason() {
    const k = this.world.seasonK || [1, 0, 0, 0];
    U_SEASON.value.set(k[0], k[1], k[2], k[3]);
    const win = k[3];
    U_SNOW_P.value = win * 0.8;
    const t = this.tint ||= new THREE.Color();
    t.setRGB(
      1 + 0.02 * k[0] + 0.05 * k[2] - 0.04 * win,
      1 + 0.05 * k[0] - 0.03 * k[2] - 0.02 * win,
      1 - 0.03 * k[0] - 0.12 * k[2] + 0.04 * win,
    );
    for (const v of this.views.values()) {
      const fr = v.isl.has('frozen');
      v.snowT.value = win * (fr ? 1.3 : 0.8);
      v.snowB.value = win * (fr ? 1.6 : 1.2);
      v.terrainMat.color.copy(t);
    }
  }

  // Note: folk views: smooth position, facing and rig animation by f.anim.
  syncFolk(dt) {
    const w = this.world;
    const seen = new Set();
    for (const f of w.folk) {
      const isl = w.islands.get(f.isle);
      if (!isl || !isl.revealed) continue;
      seen.add(f.id);
      let fv = this.folkViews.get(f.id);
      if (!fv || fv.stage !== f.stage || fv.sex !== f.sex) {
        if (fv) { this.scene.remove(fv.obj); if (fv.bed) this.scene.remove(fv.bed); }
        const obj = makeFolk(f.stage, f.sex);
        obj.rotation.order = 'YXZ';
        const rig = obj.userData.rig;
        rig.base = rig.body.position.y; rig.legBase = rig.legL.position.y;
        const carryObj = new THREE.Group();
        rig.body.add(carryObj);
        carryObj.position.set(0, 0.26, 0.2);
        // Note: the satchel of a scout or settler hangs at the back and shows only while a crossing task runs.
        const satchel = new THREE.Mesh(SATCHEL_GEO, SATCHEL_MAT);
        satchel.position.set(0.1, 0.2, -0.1); satchel.visible = false;
        rig.body.add(satchel);
        fv = { obj, rig, stage: f.stage, sex: f.sex, carryObj, satchel, carry: null, t: Math.random() * 10, p: null, yaw: f.face, gone: 0 };
        this.folkViews.set(f.id, fv);
        this.scene.add(obj);
      }
      // Note: visitors keep an accent: wanderer cloak, pilgrim staff, merchant pack.
      const vk = f.visitor && typeof f.visitor.kind === 'string' ? f.visitor.kind : null;
      if (vk !== (fv.vk || null)) { removeAccent(fv.acc); fv.acc = vk ? addAccent(fv.rig, vk) : null; fv.vk = vk; }
      // Note: the beret shows only while the artist works on a piece, like the tools.
      const wantBeret = !!(f.task && f.task.type === 'art' && f.prop && (f.anim === 'work' || f.anim === 'plant'));
      if (wantBeret !== !!fv.beret) {
        if (wantBeret) { fv.beret = makeBeret(); fv.rig.head.add(fv.beret); } else { fv.rig.head.remove(fv.beret); fv.beret = null; }
      }
      const wantHat = !!(f.task && f.task.type === 'tend' && f.task.mode !== 'shear' && f.anim === 'work');
      if (wantHat !== !!fv.hat) {
        if (wantHat) { fv.hat = makeStrawHat(); fv.rig.head.add(fv.hat); } else { fv.rig.head.remove(fv.hat); fv.hat = null; }
      }
      const wantCap = !!(f.fisher && f.task && f.task.type === 'gather' && f.task.r && f.task.r.kind === 'fish' && f.anim === 'fish');
      if (wantCap !== !!fv.cap) {
        if (wantCap) { fv.cap = makeFisherHat(); fv.rig.head.add(fv.cap); } else { fv.rig.head.remove(fv.cap); fv.cap = null; }
      }
      const p = w.folkWorldPos(f);
      if (!fv.p) fv.p = new THREE.Vector3(p.x, p.y, p.z);
      const k = 1 - Math.exp(-dt * 16);
      fv.p.x += (p.x - fv.p.x) * k; fv.p.y += (p.y - fv.p.y) * k; fv.p.z += (p.z - fv.p.z) * k;
      let dy = f.face - fv.yaw; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      fv.yaw += dy * (1 - Math.exp(-dt * 10));
      fv.t += dt;
      const r = fv.rig;
      r.body.rotation.set(0, 0, 0); r.body.position.y = r.base;
      r.legL.rotation.set(0, 0, 0); r.legR.rotation.set(0, 0, 0); r.legL.position.y = r.legBase; r.legR.position.y = r.legBase;
      r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0); r.head.rotation.set(0, 0, 0);
      fv.obj.rotation.set(0, fv.yaw, 0);
      fv.obj.position.copy(fv.p);
      const anim = f.anim;
      const hidden = (anim === 'sleep' && f.task && f.task.inHome && f.task.phase === 'sleep') || !!f.aboard || (f.link && (f.link.l.type === 'balloon' || f.link.l.type === 'cablecar'));
      fv.obj.visible = !hidden;
      // Note: anim work/plant during a tier job means the do phase; the view swaps in the can or rag gestures.
      const tj = !hidden && f.task && (f.task.type === 'water' || f.task.type === 'tidy') && (anim === 'work' || anim === 'plant') ? f.task.type : null;
      const outdoorSleep = anim === 'sleep' && f.task && !f.task.inHome && f.task.phase === 'sleep';
      if (outdoorSleep && !fv.bed) { fv.bed = makeBedroll(f.id); this.scene.add(fv.bed); }
      if (fv.bed) {
        fv.bed.visible = outdoorSleep;
        if (outdoorSleep) { fv.bed.position.set(fv.p.x, fv.p.y + 0.02, fv.p.z); fv.bed.rotation.y = fv.yaw; }
      }
      if (anim === 'sleep') {
        fv.obj.rotation.x = -Math.PI / 2; fv.obj.position.y += 0.1;
        r.armL.rotation.z = 0.2; r.armR.rotation.z = -0.2;
      } else (STAGE_ANIM[tj || anim] || STAGE_ANIM.idle)(r, fv.t, f);
      const prop = tj ? (tj === 'water' ? 'can' : 'cloth') : !hidden && (anim === 'work' || anim === 'plant' || anim === 'fish' || anim === 'shrug') && f.prop || null;
      if (prop !== fv.prop) {
        if (fv.propObj) { r.armR.remove(fv.propObj); fv.propObj = null; }
        fv.prop = prop;
        if (prop) { fv.propObj = makeProp(prop); fv.propObj.position.set(0, r.hand, 0); r.armR.add(fv.propObj); }
      }
      // Note: the can tips forward while pouring.
      if (fv.propObj && prop === 'can') {
        const tip = 0.45 + Math.sin(fv.t * 1.6) * 0.15;
        fv.propObj.rotation.x = tip;
        // Note: the water runs only while the can is tipped past the level.
        fv.pourAcc = (fv.pourAcc || 0) + dt * (tip > 0.4 ? 30 : 0);
        if (fv.pourAcc >= 1) {
          fv.obj.updateMatrixWorld(true);
          const sp = fv.propObj.localToWorld(new THREE.Vector3(0, -0.07, 0.24));
          const fx = Math.sin(fv.yaw) * 0.6; const fz = Math.cos(fv.yaw) * 0.6;
          for (; fv.pourAcc >= 1; fv.pourAcc -= 1) this.fx.pour(sp.x, sp.y, sp.z, fx, fz);
        }
      }
      if (fv.propObj && fv.propObj.userData.bob) {
        const tk = f.task; const tot = tk && tk.total || 8; const el = tk && tk.total ? tot - tk.t : 3;
        fv.propObj.userData.tackle.visible = el > 0.9 && el < tot - 0.6;
        // Note: the bobber floats, twitches now and then and sinks when a fish bites.
        const bite = el > tot - 2.2 ? Math.abs(Math.sin(el * 7)) * 0.05 + 0.03 : Math.max(0, Math.sin(el * 3.1) - 0.85) * 0.12;
        const d = Math.sin(fv.t * 2.2) * 0.008 + bite;
        fv.propObj.userData.bob.position.set(0, -1.19 - d * 0.58, 0.44 - d * 0.81);
      }
      fv.satchel.visible = !!((f.task && f.task.type === 'cross') || (f.queue && f.queue.type === 'cross'));
      const carry = f.carry && (f.carry.good || f.carry) || null;
      const cg = typeof carry === 'string' ? carry : null;
      if (cg !== fv.carry) {
        while (fv.carryObj.children.length) fv.carryObj.remove(fv.carryObj.children[0]);
        fv.carry = cg;
        if (cg) { const c = makeCrate(cg); c.scale.setScalar(0.8); fv.carryObj.add(c); }
      }
    }
    for (const [id, fv] of this.folkViews) {
      if (!seen.has(id)) { this.scene.remove(fv.obj); if (fv.bed) this.scene.remove(fv.bed); this.folkViews.delete(id); }
    }
    this.separateFolk(dt);
  }

  // Note: view-only: folk that stand too close ease apart; sim positions are untouched.
  separateFolk(dt) {
    const list = [];
    for (const f of this.world.folk) {
      const fv = this.folkViews.get(f.id);
      if (!fv || !fv.obj.visible || f.anim === 'sleep' || (f.task && f.task.seat && (f.anim === 'sit' || f.anim === 'sitEat'))) continue;
      list.push({ f, fv });
    }
    const MIN = 0.55;
    for (const a of list) { a.fv.want = a.fv.want || { x: 0, z: 0 }; a.fv.want.x = 0; a.fv.want.z = 0; }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (a.f.isle !== b.f.isle) continue;
      let dx = a.fv.p.x - b.fv.p.x; let dz = a.fv.p.z - b.fv.p.z;
      const d = Math.hypot(dx, dz);
      if (d >= MIN) continue;
      if (d < 0.02) { const h = ((a.f.id * 2654435761 + b.f.id * 40503) >>> 0) % 628 / 100; dx = Math.cos(h); dz = Math.sin(h); } else { dx /= d; dz /= d; }
      const push = (MIN - d) * 0.5;
      a.fv.want.x += dx * push; a.fv.want.z += dz * push;
      b.fv.want.x -= dx * push; b.fv.want.z -= dz * push;
    }
    const k = 1 - Math.exp(-dt * 5);
    for (const { fv } of list) {
      const sep = fv.sep || (fv.sep = { x: 0, z: 0 });
      sep.x += (Math.max(-0.35, Math.min(0.35, fv.want.x)) - sep.x) * k;
      sep.z += (Math.max(-0.35, Math.min(0.35, fv.want.z)) - sep.z) * k;
      fv.obj.position.x = fv.p.x + sep.x; fv.obj.position.z = fv.p.z + sep.z;
    }
  }

  // Note: animal views: smooth position, then a small rig animation by kind and anim.
  syncAnimals(dt) {
    const w = this.world;
    const seen = new Set();
    for (const a of w.animals) {
      const isl = w.islands.get(a.isle);
      if (!isl || !isl.revealed) continue;
      seen.add(a.id);
      let av = this.animalViews.get(a.id);
      if (!av) {
        const obj = a.kind === 'dog' ? makeDog(a.id) : a.kind === 'bird' ? makeBird(a.id) : a.kind === 'hen' ? makeHen(a.variant) : a.kind === 'sheep' ? makeSheep(a.variant) : a.kind === 'fish' ? makeFish(a.variant) : makeButterfly(a.id);
        obj.rotation.order = 'YXZ';
        // Note: sizes follow real proportions against a folk (0.76 tall); the butterfly stays a little large to remain visible.
        obj.scale.setScalar(ANIMAL_SCALE[a.kind] || 1);
        av = { obj, rig: obj.userData.rig, p: null, yaw: a.face, t: Math.random() * 10 };
        this.animalViews.set(a.id, av);
        this.scene.add(obj);
      }
      av.obj.visible = !a.hidden;
      if (a.hidden) continue;
      let tx = isl.wx + a.x - N / 2; let tz = isl.wz + a.z - N / 2;
      let ty = isl.heightAt(a.x, a.z) + a.alt;
      if (a.link) {
        // Note: a herded animal on a bridge rides the link polyline.
        const lp = linkPos(a.link.l, Math.min(1, a.link.t), a.link.rev);
        tx = lp.x; ty = lp.y + a.alt; tz = lp.z;
      }
      if (!av.p) av.p = new THREE.Vector3(tx, ty, tz);
      const k = 1 - Math.exp(-dt * 14);
      const px = av.p.x; const pz = av.p.z;
      av.p.x += (tx - av.p.x) * k; av.p.y += (ty - av.p.y) * k; av.p.z += (tz - av.p.z) * k;
      const speed = Math.hypot(av.p.x - px, av.p.z - pz) / Math.max(dt, 1e-3);
      let dy = a.face - av.yaw; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      av.yaw += dy * (1 - Math.exp(-dt * (a.kind === 'butterfly' ? 4 : 10)));
      av.t += dt;
      av.obj.position.copy(av.p);
      av.obj.rotation.set(0, av.yaw, 0);
      const r = av.rig; const t = av.t;
      if (a.kind === 'dog') {
        const moving = a.anim === 'walk' || a.anim === 'run';
        const ph = t * (a.anim === 'run' ? 16 : 10);
        const amp = moving ? (a.anim === 'run' ? 0.8 : 0.5) : 0;
        r.legs.forEach((l, n) => { l.rotation.x = Math.sin(ph + (n === 1 || n === 2 ? Math.PI : 0)) * amp; l.position.y = 0; });
        r.body.position.y = r.base + (moving ? Math.abs(Math.sin(ph)) * 0.025 : 0);
        r.body.rotation.set(0, 0, 0);
        r.head.rotation.set(0, 0, 0);
        r.tail.rotation.set(moving ? -0.3 : 0, Math.sin(t * (moving ? 6 : 11)) * (a.anim === 'lie' ? 0.1 : 0.5), 0);
        if (a.anim === 'sit') { r.body.rotation.x = -0.7; r.body.position.y = r.base - 0.06; r.legs.forEach((l, n) => { l.rotation.x = n < 2 ? 0.7 : -1.2; }); r.head.rotation.x = 0.7; }
        if (a.anim === 'lie') { r.body.position.y = r.base - 0.1; r.legs.forEach((l, n) => { l.rotation.x = n < 2 ? 1.3 : -1.3; }); r.head.rotation.x = 0.3; }
        if (a.barkT > 0) { r.head.rotation.x = -0.35 * Math.abs(Math.sin(t * 22)); r.body.position.y += 0.015; }
      } else if (a.kind === 'bird') {
        const fly = a.anim === 'fly';
        const wing = fly ? Math.sin(t * 30) * 0.85 + 0.1 : -0.3;
        // Note: perched wings fold back along the flanks instead of drooping sideways.
        const sweep = fly ? 0 : 1.35;
        r.wings[0].rotation.set(0, -sweep, -wing); r.wings[1].rotation.set(0, sweep, wing);
        r.wings[0].scale.x = r.wings[1].scale.x = fly ? 1 : 0.7;
        r.legs.visible = !fly;
        r.body.rotation.x = fly ? -0.15 : Math.sin(t * 2.1 + a.id) * 0.05 + (Math.sin(t * 0.9 + a.id * 3) > 0.7 ? 0.28 : 0);
        r.body.position.y = r.base + (fly ? Math.sin(t * 30) * 0.015 : 0);
      } else if (a.kind === 'fish') {
        const jump = a.state === 'jump';
        r.tail.rotation.y = Math.sin(t * (jump ? 24 : a.anim === 'swim' ? 9 : 3) + a.id) * (jump ? 0.7 : 0.45);
        r.body.rotation.y = Math.sin(t * 9 + a.id) * (a.anim === 'swim' ? 0.1 : 0.03);
        av.obj.rotation.x = jump ? -Math.cos(a.k * Math.PI) * 0.9 : 0;
      } else if (a.kind === 'hen') {
        const moving = a.anim === 'walk';
        const ph = t * 12;
        r.legs.forEach((l, n) => { l.rotation.x = moving ? Math.sin(ph + n * Math.PI) * 0.7 : 0; });
        r.body.position.y = r.base + (moving ? Math.abs(Math.sin(ph)) * 0.012 : 0);
        r.head.rotation.x = a.anim === 'peck' ? 0.9 * Math.abs(Math.sin(t * 7 + a.id)) : moving ? Math.sin(ph * 2) * 0.12 : 0;
        r.head.position.z = 0.09 + (moving ? Math.sin(ph * 2) * 0.012 : 0);
        r.tail.rotation.x = a.anim === 'peck' ? 0.3 : 0;
      } else if (a.kind === 'sheep') {
        const moving = a.anim === 'walk';
        const ph = t * 6;
        r.legs.forEach((l, n) => { l.rotation.x = moving ? Math.sin(ph + (n === 1 || n === 2 ? Math.PI : 0)) * 0.4 : 0; });
        r.body.position.y = r.base + (moving ? Math.abs(Math.sin(ph)) * 0.01 : 0);
        r.head.rotation.x = a.anim === 'graze' ? 0.75 + Math.sin(t * 2 + a.id) * 0.08 : 0;
        r.fleece.visible = a.wool >= 0.35;
        r.fleece.scale.setScalar(0.7 + 0.3 * Math.min(1, a.wool));
      } else {
        const ph = t * 15 + a.id;
        const wing = 0.25 + Math.abs(Math.sin(ph)) * 0.95;
        r.wings[0].rotation.z = -wing; r.wings[1].rotation.z = wing;
        av.obj.rotation.z = Math.sin(t * 2 + a.id) * 0.2;
      }
    }
    for (const [id, av] of this.animalViews) {
      if (!seen.has(id)) { this.scene.remove(av.obj); this.animalViews.delete(id); }
    }
  }

  // Note: arrival balloons cruise in along a clear bearing, drop onto the pad, wait, then rise and leave the same way.
  syncArrivals(dt = 0) {
    const live = new Set(this.world.arrivals);
    this.arrBalloons = this.arrBalloons || new Map();
    this.arrT = this.arrT || new Map();
    // Note: the wind tool sets the wind in one step, so the balloons rock in a copy that eases toward it.
    const sim = this.world.weather.wind;
    const wd0 = this.arrWind || (this.arrWind = { x: sim.x, z: sim.z, s: sim.s });
    const kw = Math.min(1, dt * 2);
    wd0.x += (sim.x - wd0.x) * kw; wd0.z += (sim.z - wd0.z) * kw; wd0.s += (sim.s - wd0.s) * kw;
    for (const ar of live) {
      const v = this.views.get(ar.isl.id);
      if (!v || ar.pad.gone) continue;
      let o = this.arrBalloons.get(ar);
      if (!o) { o = makeBalloon(); o.scale.setScalar(BALLOON_SCALE); this.scene.add(o); this.arrBalloons.set(ar, o); }
      const p = v.bPos(ar.pad);
      const bx0 = ar.isl.wx + p.x; const bz0 = ar.isl.wz + p.z;
      const rest = p.y + 0.18;
      // Note: ar.t only moves in 0.1 s sim steps, so the view runs its own clock that eases gently toward it.
      let ts = this.arrT.get(ar);
      if (ts === undefined || Math.abs(ar.t - ts) > 1) ts = ar.t;
      else ts += dt + (ar.t - ts) * Math.min(1, dt * 0.8);
      this.arrT.set(ar, ts);
      // Note: the path comes from flight.js (cruise, vertical drop, vertical lift) so the clearance checks fit what is drawn.
      const wd = this.arrWind;
      const fb = flightBase(ar, ts, bx0, bz0, rest);
      const sw = flightSway(ar, this.time, wd, fb.air);
      const air = fb.air; const gust = sw.gust; const ph = sw.ph;
      o.position.set(fb.x + sw.x, fb.y + sw.y, fb.z + sw.z);
      o.rotation.y = ar.ang + this.time * 0.1;
      o.rotation.z = Math.sin(this.time * 1.1 + ar.ang) * 0.05 * gust * (0.4 + air) + wd.x * 0.12 * air;
      o.rotation.x = Math.sin(this.time * 0.9 + ph) * 0.04 * gust * (0.4 + air) + wd.z * 0.12 * air;
      // Note: a balloon resting on its pad is tied to a stake beside it with a rope.
      this.arrRopes = this.arrRopes || new Map();
      let rp = this.arrRopes.get(ar);
      if (air < 0.01) {
        if (!rp) this.arrRopes.set(ar, rp = new Rope(this.scene));
        rp.set(ropeV1.set(bx0 + 0.55, p.y + 0.12, bz0 + 0.45), ropeV2.set(o.position.x, o.position.y + 0.1, o.position.z));
      } else if (rp) { rp.dispose(); this.arrRopes.delete(ar); }
    }
    for (const [ar, o] of this.arrBalloons) {
      if (!live.has(ar)) {
        this.scene.remove(o); this.arrBalloons.delete(ar); this.arrT.delete(ar);
        const rp = this.arrRopes && this.arrRopes.get(ar);
        if (rp) { rp.dispose(); this.arrRopes.delete(ar); }
      }
    }
  }

  // Note: airships follow ship.plan on an eased clock like the balloons, so the 0.1 s sim steps never show.
  syncShips(dt) {
    const w = this.world;
    const ships = w.ships || [];
    const views = this.shipViews;
    const wind = U_WIND.value;
    this.shipLights.length = 0;
    const live = new Set();
    for (const s of ships) {
      if (!s || s.dead || s.state === 'hold' || !s.pos) continue;
      live.add(s.id);
      let sv = views.get(s.id);
      if (!sv || sv.kind !== s.kind) {
        if (sv) this.removeShip(sv);
        const g = makeAirship(s.kind);
        g.rotation.order = 'YXZ';
        // Note: the mooring line ties to the nearer tip of the envelope; both tips are measured once in hull space.
        const hb = new THREE.Box3().setFromObject(g);
        g.userData.tips = [new THREE.Vector3(0, hb.max.y * 0.55, hb.max.z - 0.1), new THREE.Vector3(0, hb.max.y * 0.55, hb.min.z + 0.1)];
        const crates = new THREE.Group();
        g.add(crates);
        this.scene.add(g);
        sv = { g, kind: s.kind, p: null, ts: 0, plan: null, yaw: s.yaw || 0, vy: 0, crates, cargoSig: null, id: s.id };
        views.set(s.id, sv);
      }
      let tx = s.pos.x; let ty = s.pos.y; let tz = s.pos.z; let yaw = s.yaw || 0;
      const moving = s.plan && (s.state === 'depart' || s.state === 'flight' || s.state === 'land');
      if (moving) {
        if (sv.plan !== s.plan) { sv.plan = s.plan; sv.ts = s.t; }
        else {
          sv.ts += dt + (s.t - sv.ts) * Math.min(1, dt * 0.8);
          if (Math.abs(s.t - sv.ts) > 1) sv.ts = s.t;
        }
        sv.ts = clamp(sv.ts, 0, s.plan.dur);
        const q = posAt(s.plan, sv.ts);
        tx = q.x; ty = q.y; tz = q.z; yaw = s.plan.yaw;
      } else sv.plan = null;
      let vy = 0;
      if (!sv.p) sv.p = new THREE.Vector3(tx, ty, tz);
      else if (Math.hypot(tx - sv.p.x, ty - sv.p.y, tz - sv.p.z) > 8) sv.p.set(tx, ty, tz);
      else {
        const k = 1 - Math.exp(-dt * 5);
        const py = sv.p.y;
        sv.p.x += (tx - sv.p.x) * k; sv.p.y += (ty - sv.p.y) * k; sv.p.z += (tz - sv.p.z) * k;
        vy = dt > 1e-4 ? (sv.p.y - py) / dt : 0;
      }
      sv.vy += (vy - sv.vy) * Math.min(1, dt * 3);
      let dy = yaw - sv.yaw; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      sv.yaw += dy * (1 - Math.exp(-dt * 3));
      const air = moving ? 1 : s.state === 'ground' ? 0 : 0.25;
      const g = sv.g;
      g.position.set(sv.p.x, sv.p.y + Math.sin(this.time * 1.4 + s.id * 1.7) * 0.035 * air, sv.p.z);
      g.rotation.set(-clamp(sv.vy * 0.07, -0.1, 0.1), sv.yaw, Math.sin(this.time * 0.8 + s.id) * 0.025 * air + (dy * 0.15));
      g.userData.update(this.time, wind);
      // Note: crates ride the gondola slots; a visiting trader shows the good it brings until it leaves.
      let goods = [];
      for (const k of Object.keys(s.cargo || {})) for (let n = 0; n < (s.cargo[k] | 0); n++) goods.push(k);
      const o = s.visit && s.visit.offer;
      if (!goods.length && o && o.get && !s.visit.done && s.state === 'unload') goods = [o.get.good];
      const slots = g.userData.slots || [];
      goods = goods.slice(0, slots.length);
      const sig = goods.join(',');
      if (sig !== sv.cargoSig) {
        sv.cargoSig = sig;
        while (sv.crates.children.length) sv.crates.remove(sv.crates.children[0]);
        goods.forEach((gd, k) => { try { const c = makeCrate(gd); c.position.copy(slots[k]); sv.crates.add(c); } catch (e) { /* Note: unknown good id: skip the crate. */ } });
      }
      g.updateMatrixWorld(true);
      // Note: a hull resting at its dock is tied to the mooring mast ring with a rope.
      const iv = !moving && (s.state === 'idle' || s.state === 'load' || s.state === 'unload') ? this.views.get(s.from) : null;
      const db = iv && s.dock >= 0 ? iv.isl.buildings[s.dock] : null;
      const dv = db && !db.gone ? iv.bviews.get(db) : null;
      const mu = dv && dv.obj && dv.obj.userData;
      const moor = mu && ((mu.moors && mu.moors[s.slot | 0]) || mu.moor);
      if (moor) {
        dv.obj.updateWorldMatrix(true, false);
        const ring = dv.obj.localToWorld(ropeV1.copy(moor));
        sv.rope = sv.rope || new Rope(this.scene);
        const tp = g.userData.tips;
        const t0 = g.localToWorld(ropeV2.copy(tp[0]));
        const t1 = g.localToWorld(ropeV3.copy(tp[1]));
        sv.rope.set(ring, ring.distanceToSquared(t0) <= ring.distanceToSquared(t1) ? t0 : t1);
      } else if (sv.rope) { sv.rope.dispose(); sv.rope = null; }
      for (const l of g.userData.lamps || []) {
        const lw = g.localToWorld(l.clone());
        this.shipLights.push({ x: lw.x, y: lw.y, z: lw.z, color: 0xffd48a, base: 0.32, day: 0, lamp: true });
      }
    }
    for (const [id, sv] of views) {
      if (!live.has(id)) { this.removeShip(sv); views.delete(id); }
    }
  }

  removeShip(sv) {
    this.scene.remove(sv.g);
    if (sv.rope) { sv.rope.dispose(); sv.rope = null; }
  }

  // Note: storm aftermath: marks the damaged buildings; each island view draws its own cue.
  markDamage(list) {
    this.clearDamage();
    for (const d of list || []) {
      const v = this.views.get(d.isl);
      if (!v) continue;
      const b = v.isl.buildings[d.b];
      if (!b || b.gone || (d.bid && b.id !== d.bid)) continue;
      v.dmg.set(b, { part: d.part, prop: d.prop });
    }
  }

  clearDamage() {
    for (const v of this.views.values()) v.dmg.clear();
  }

  syncLinks(dt) {
    const w = this.world;
    const live = new Set();
    for (const l of w.links) {
      if (!l.type || !l.pts || l.state === 'none') continue;
      live.add(l);
      let lv = this.linkViews.get(l);
      const prog = l.state === 'done' ? 1 : l.progress;
      const tier = l.tier | 0, be = l.benchEnd | 0;
      if (!lv || lv.type !== l.type || Math.abs(lv.prog - prog) > 0.035 || (prog >= 1 && lv.prog < 1) || lv.tier !== tier || (tier >= 3 && lv.be !== be)) {
        if (lv) { this.scene.remove(lv.obj); lv.obj.userData.dispose?.(); }
        if (lv && lv.rope) { lv.rope.dispose(); lv.rope = null; }
        const obj = buildLinkMesh(l.type, l.pts, prog, tier, be);
        obj.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.isMeshBasicMaterial; } });
        this.scene.add(obj);
        // Note: only a rising tier of an already shown link chimes; first creation and restore stay silent.
        if (lv && prog >= 1 && lv.prog >= 1 && tier > lv.tier && this.onTier) {
          const m = l.pts[l.pts.length >> 1];
          this.onTier({ x: m.x, y: m.y, z: m.z }, tier, l);
        }
        lv = { obj, type: l.type, prog, tier, be, vpos: lv ? lv.vpos : null, vu: lv ? lv.vu : 0 };
        this.linkViews.set(l, lv);
      }
      const ud = lv.obj.userData;
      const veh = ud.balloon || ud.gondola;
      if (veh) {
        const rider = w.folk.find((f) => f.link && f.link.l === l);
        if (rider) lv.vu += ((rider.link.rev ? 1 - rider.link.t : rider.link.t) - lv.vu) * Math.min(1, dt * 2.5);
        if (ud.balloon) {
          const p = linkPos(l, lv.vu, false);
          veh.position.set(p.x, p.y + 0.95 + Math.sin(this.time * 1.2 + l.len) * 0.08, p.z);
          veh.userData.update?.(this.time, U_WIND.value);
          if (rider) veh.rotation.y = Math.atan2(l.pts[l.pts.length - 1].x - l.pts[0].x, l.pts[l.pts.length - 1].z - l.pts[0].z) + (rider.link.rev ? Math.PI : 0);
          // Note: a balloon waiting at a dock is tied to the dock post with a rope.
          const end = !rider && lv.vu < 0.02 ? 0 : !rider && lv.vu > 0.98 ? 1 : -1;
          if (end >= 0 && ud.dock) {
            const at = ud.dock[end];
            const post = ropeV1.set(0, 0.27, -0.3).applyAxisAngle(ROPE_UP, Math.atan2(ud.dock[1].x - ud.dock[0].x, ud.dock[1].z - ud.dock[0].z) + (end ? Math.PI : 0)).add(at);
            lv.rope = lv.rope || new Rope(this.scene);
            lv.rope.set(post, ropeV2.set(veh.position.x, veh.position.y + 0.1, veh.position.z));
          } else if (lv.rope) { lv.rope.dispose(); lv.rope = null; }
        } else if (ud.cable) {
          veh.position.lerpVectors(ud.cable[0], ud.cable[1], lv.vu);
          veh.position.y += Math.sin(this.time * 2 + l.len) * 0.01;
          veh.rotation.z = Math.sin(this.time * 1.6) * 0.03;
        }
      }
    }
    for (const [l, lv] of this.linkViews) {
      if (!live.has(l)) { this.scene.remove(lv.obj); lv.obj.userData.dispose?.(); if (lv.rope) lv.rope.dispose(); this.linkViews.delete(l); }
    }
  }

  syncWeather(dt) {
    const w = this.world;
    const fx = this.fx;
    const live = new Set();
    for (const e of w.weather.events) {
      const v = this.views.get(e.isl);
      if (!v || !v.isl.revealed) continue;
      live.add(e);
      const isl = v.isl;
      const t = e.age / e.life;
      const env = Math.min(1, t * 6, (1 - t) * 4) * (e.max ?? 1);
      const wx = isl.wx + e.x - N / 2; const wz = isl.wz + e.z - N / 2;
      const gy = isl.heightAt(clamp(e.x, 0, N - 0.01), clamp(e.z, 0, N - 0.01));
      if (e.kind === 'sun') {
        const n = Math.floor(env * e.r * 2.2 * dt * 8 + Math.random());
        for (let k = 0; k < n; k++) {
          const a = Math.random() * 6.28; const d = Math.sqrt(Math.random()) * e.r;
          const x = wx + Math.cos(a) * d; const z = wz + Math.sin(a) * d;
          fx.glow.emit(x, isl.heightAt(clamp(e.x + Math.cos(a) * d, 0, N - 0.01), clamp(e.z + Math.sin(a) * d, 0, N - 0.01)) + 0.2, z, 0, 0.35 + Math.random() * 0.3, 0, 2.2, 0.14, 0.03, 1, 0.92, 0.55, 0.6 * env, 0, 0.1);
        }
        continue;
      }
      let m = this.wxClouds.get(e);
      if (!m) {
        m = cloudMesh(e.kind === 'snow' ? this.snowMat : this.cloudMat);
        this.scene.add(m);
        this.wxClouds.set(e, m);
      }
      m.position.set(wx, gy + (e.kind === 'rain' ? 8.2 : 6.6), wz);
      const s = e.r * 0.42 * (0.25 + 0.75 * smooth01(env));
      m.scale.set(s, s * 0.75, s);
      const n = Math.floor(env * e.r * (e.kind === 'rain' ? 40 : 14) * dt + Math.random());
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.28; const d = Math.sqrt(Math.random()) * e.r * 0.9;
        const x = wx + Math.cos(a) * d; const z = wz + Math.sin(a) * d;
        if (e.kind === 'rain') fx.rain(x, gy + 7.4, z); else fx.snow(x, gy + 5.6, z);
      }
    }
    for (const [e, m] of this.wxClouds) {
      if (!live.has(e)) { this.scene.remove(m); m.geometry.dispose(); this.wxClouds.delete(e); }
    }
  }

  // Note: fire, steam, drips, smoke, fireflies; only near the camera.
  effects(dt, camTarget) {
    const w = this.world; const fx = this.fx;
    this.effT += dt;
    const night = w.night;
    const sk = w.seasonK;
    for (const v of this.views.values()) {
      const isl = v.isl;
      if (!isl.revealed) continue;
      if (Math.hypot(isl.wx - camTarget.x, isl.wz - camTarget.z) > 70) continue;
      v.fireT -= dt;
      if (v.fireT <= 0) {
        v.fireT = 0.25;
        v.fireCells.length = 0;
        let burning = false;
        for (let c = 0; c < N * N; c++) if (isl.fire[c] > 0.05) { v.fireCells.push(c); burning = true; }
        if (burning) { isl.ver.terrain++; }
        v.treeCells.length = 0;
        if (sk && (sk[0] > 0.08 || sk[2] > 0.08)) {
          for (let c = 0; c < N * N; c++) { const kd = isl.plant[c] === 3 || isl.plant[c] === 5; if (kd && isl.grow[c] > 0.6) v.treeCells.push(c); }
        }
        v.drips = [];
        for (let c = 0; c < N * N; c++) {
          if (!isl.mask[c] || isl.water[c] < 0.1) continue;
          const i = c % N; const j = (c / N) | 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isl.land(i + di, j + dj)) { v.drips.push([c, di, dj]); break; }
        }
      }
      if (v.treeCells.length) {
        const tc = v.treeCells; const wd = w.weather.wind;
        const pick = () => { const c = tc[(Math.random() * tc.length) | 0]; return [isl.wx + (c % N) + Math.random() - N / 2, isl.cellH(c % N, (c / N) | 0) + 1.5 + Math.random() * 1.5, isl.wz + ((c / N) | 0) + Math.random() - N / 2]; };
        if (Math.random() < dt * 3 * sk[0] * Math.min(1, tc.length / 6)) { const p = pick(); fx.petal(p[0], p[1], p[2], wd.x, wd.z); }
        if (Math.random() < dt * 4 * sk[2] * Math.min(1, tc.length / 6)) { const p = pick(); fx.fall(p[0], p[1], p[2], wd.x, wd.z, LEAF_COLS[(Math.random() * LEAF_COLS.length) | 0]); }
      }
      for (const c of v.fireCells) {
        const f = isl.fire[c];
        const i = c % N; const j = (c / N) | 0;
        const x = isl.wx + i + 0.5 - N / 2; const z = isl.wz + j + 0.5 - N / 2; const y = isl.cellH(i, j);
        if (Math.random() < dt * 14 * Math.min(1, f + 0.2)) fx.flame(x, y + 0.1, z, 1 + f);
        if (Math.random() < dt * 3) fx.smoke(x, y + 0.5, z, 1.4, 0.35);
        if (Math.random() < dt * 1.2) fx.ember(x, y + 0.4, z);
      }
      for (const d of v.drips || []) {
        if (Math.random() < dt * 5 * Math.min(1, isl.water[d[0]] * 1.5)) {
          const i = d[0] % N; const j = (d[0] / N) | 0;
          fx.drip(isl.wx + i + 0.5 - N / 2 + d[1] * 0.5, isl.cellH(i, j) + isl.water[d[0]] - 0.05, isl.wz + j + 0.5 - N / 2 + d[2] * 0.5, d[1] * 0.5, d[2] * 0.5);
        }
      }
      for (const g of isl.geysers) {
        const x = isl.wx + g.i + 0.5 - N / 2; const z = isl.wz + g.j + 0.5 - N / 2; const y = isl.cellH(g.i, g.j);
        if (g.erupt > 0) { for (let k = 0; k < 4; k++) fx.steam(x, y + 0.1, z, true); }
        else if (Math.random() < dt * 2) fx.steam(x, y + 0.1, z, false);
      }
      for (const s of isl.springs) {
        if (s.hot && Math.random() < dt * 1.5) fx.steam(isl.wx + s.i + 0.5 - N / 2, isl.cellH(s.i, s.j) + isl.water[cidx(s.i, s.j)], isl.wz + s.j + 0.5 - N / 2, false);
      }
      for (const [b, bv] of v.bviews) {
        if (!b.built && !(b.burn > 0.5)) continue;
        const ud = bv.obj.userData;
        const wp = bv.g.position;
        const ox = isl.wx + wp.x; const oz = isl.wz + wp.z;
        if (b.burn > 0.5) { for (let k = 0; k < 2; k++) fx.flame(ox + (Math.random() - 0.5) * b.size * 0.7, wp.y + 0.4 + Math.random() * (ud.height || 1), oz + (Math.random() - 0.5) * b.size * 0.7, 1.4); if (Math.random() < dt * 6) fx.smoke(ox, wp.y + (ud.height || 1), oz, 1.8, 0.3); }
        if (b.built && (ud.plumes || ud.spots)) this.tierFx(b, bv, ud, dt, night);
        if (!ud.smoke && !ud.flame) continue;
        const sp = ud.smoke ? bv.obj.localToWorld(ud.smoke.clone()) : null;
        if (b.id === 'campfire' || b.id === 'bonfire') {
          if (b.lit === false) continue;
          const big = b.id === 'bonfire';
          const fp = bv.obj.localToWorld(new THREE.Vector3(0, big ? 0.4 : 0.2, 0));
          if (Math.random() < dt * (big ? 24 : 16)) fx.flame(fp.x, fp.y, fp.z, big ? 1.4 : 0.8);
          if (Math.random() < dt * 1.3) fx.spark(fp.x, fp.y + 0.2, fp.z, 1, 0.7, 0.3, 0.5);
          if (sp && Math.random() < dt * 2.2) fx.smoke(sp.x, sp.y, sp.z, 1, 0.55);
        } else if (sp) {
          const warm = b.id === 'hut' ? night > 0.35 : b.working;
          if (warm && Math.random() < dt * (b.id === 'hut' ? 1.6 : 3)) fx.smoke(sp.x, sp.y, sp.z, 1, b.id === 'hut' ? 0.8 : 0.6);
        }
      }
      if (night > 0.45 && !isl.has('arid') && !isl.has('frozen') && Math.random() < dt * 6 * night) {
        const i = (Math.random() * N) | 0; const j = (Math.random() * N) | 0;
        const c = cidx(i, j);
        if (isl.mask[c] && isl.moist[c] > 0.3 && isl.water[c] < 0.1) {
          fx.glow.emit(isl.wx + i + Math.random() - N / 2, isl.cellH(i, j) + 0.4 + Math.random() * 0.6, isl.wz + j + Math.random() - N / 2, (Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2, 4, 0.1, 0.1, 0.8, 1, 0.45, 0.8, 0, 0.3);
        }
      }
    }
    const wd = w.weather.wind;
    if (wd.s > 0.28 && Math.random() < dt * (wd.s - 0.2) * 30) {
      fx.wind(camTarget.x + (Math.random() - 0.5) * 30 - wd.x * 15, camTarget.y + Math.random() * 6, camTarget.z + (Math.random() - 0.5) * 30 - wd.z * 15, wd.x, wd.z, wd.s);
    }
  }

  // Note: chimney plumes from kit points and T4 fireflies; skips a plume point that the legacy ud.smoke already feeds this frame.
  tierFx(b, bv, ud, dt, night) {
    const fx = this.fx; const v = this._v ||= new THREE.Vector3();
    if (ud.plumes) {
      const low = PLUME_NIGHT.has(b.id) && night > 0.35;
      const rate = b.working ? 2.4 : low ? 0.8 : 0;
      if (rate > 0) {
        const legacy = ud.smoke && (b.id === 'hut' ? night > 0.35 : b.working);
        const per = rate * dt / Math.sqrt(ud.plumes.length);
        for (const p of ud.plumes) {
          if (legacy && p.distanceToSquared(ud.smoke) < 0.09) continue;
          if (Math.random() >= per) continue;
          bv.obj.localToWorld(v.copy(p));
          fx.smoke(v.x, v.y, v.z, 1, b.working ? 0.6 : 0.8);
        }
      }
    }
    // Note: fireflies only at night, close enough to see, and inside the camera frustum.
    if (night > 0.5 && (b.flourish | 0) >= 4 && ud.spots && ud.spots.W && (this.camTop || 15) < 45) {
      if (Math.random() < dt * 0.7) {
        bv.obj.localToWorld(v.copy(ud.spots.W));
        const fr = this.frustum;
        if (fr) { const sph = this.sph; sph.center.copy(v); sph.radius = 2; if (!fr.intersectsSphere(sph)) return; }
        const a = Math.random() * 6.28; const r = 0.3 + Math.random() * 0.9;
        fx.firefly(v.x + Math.cos(a) * r, v.y + 0.3 + Math.random() * 1.1, v.z + Math.sin(a) * r);
      }
    }
  }

  syncLights(camTarget, cam) {
    const night = this.world.night;
    const top = cam && cam.top ? cam.top : 15;
    this.camTop = top;
    const pool = this.lightPool;
    // Note: lamps on screen compete for the pool; picking spreads over the whole view, not just around the camera target.
    let inView = (x, y, z) => (x - camTarget.x) ** 2 + (z - camTarget.z) ** 2 < 900;
    if (cam && cam.projectionMatrix && cam.matrixWorldInverse) {
      this.frustum ||= new THREE.Frustum(); this.pv ||= new THREE.Matrix4(); this.sph ||= new THREE.Sphere();
      this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pv);
      inView = (x, y, z) => { this.sph.center.set(x, y, z); this.sph.radius = 6; return this.frustum.intersectsSphere(this.sph); };
    }
    const all = [];
    for (const v of this.views.values()) {
      if (!v.isl.revealed) continue;
      for (const l of v.lights) {
        const e = l.base * (l.day + night * (1 - l.day));
        if (e > 0.02 && inView(l.x, l.y, l.z)) all.push({ l, e });
      }
    }
    for (const l of this.shipLights) {
      const e = l.base * (l.day + night * (1 - l.day));
      if (e > 0.02 && inView(l.x, l.y, l.z)) all.push({ l, e });
    }
    // Note: greedy farthest-point picks, each pick absorbs its nearest neighbours so a far lamp cluster is lit by one wide light.
    const picks = [];
    if (all.length) {
      const dmin = new Float32Array(all.length).fill(1e9);
      let cur = 0; let bd = 1e18;
      for (let i = 0; i < all.length; i++) { const d = (all[i].l.x - camTarget.x) ** 2 + (all[i].l.z - camTarget.z) ** 2; if (d < bd) { bd = d; cur = i; } }
      for (let k = 0; k < pool.length && cur >= 0; k++) {
        picks.push({ i: cur, e: 0, n: 0 });
        const c = all[cur].l;
        for (let i = 0; i < all.length; i++) {
          const d = (all[i].l.x - c.x) ** 2 + (all[i].l.z - c.z) ** 2;
          if (d < dmin[i]) { dmin[i] = d; all[i].owner = k; }
        }
        cur = -1; let far = 0.0001;
        for (let i = 0; i < all.length; i++) if (dmin[i] > far) { far = dmin[i]; cur = i; }
      }
      for (const a of all) { const pk = picks[a.owner]; if (pk) { pk.e += a.e; pk.n++; } }
    }
    // Note: wider reach and a gentler falloff when zoomed out, so the light fills the screen without a flat wash.
    const reach = 9 + clamp((top - 14) / 56, 0, 1) * 9;
    for (let k = 0; k < pool.length; k++) {
      const L = pool[k]; const pk = picks[k];
      if (!pk) { L.intensity = 0; continue; }
      const c = all[pk.i].l;
      L.position.set(c.x, c.y + 0.2, c.z);
      L.color.set(c.color); L.distance = reach;
      const flick = 1 + Math.sin(this.time * 11 + k * 3) * 0.05 + Math.sin(this.time * 23 + k) * 0.03;
      L.intensity = Math.min(2.4, pk.e / Math.sqrt(pk.n)) * 3.2 * flick * (1 + (reach - 9) * 0.04);
    }
    const cands = [];
    for (const v of this.views.values()) if (v.isl.revealed) for (const l of v.lights) cands.push(l);
    for (const l of this.shipLights) cands.push(l);
    this.syncGlows(cands, cam, night);
  }

  // Note: every light source gets a small bulb glint; the real lighting comes from the pooled point lights.
  syncGlows(cands, cam, night) {
    if (!this.glowPool) this.glowPool = [];
    if (typeof document === 'undefined') return; // Note: headless checks have no canvas.
    if (!this.glowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
      this.glowTex = new THREE.CanvasTexture(cv);
    }
    const top = cam && cam.top ? cam.top : 15;
    const far = clamp((top - 8) / 24, 0.2, 1);
    const size = 1.1 + top * 0.012;
    for (let k = 0; k < cands.length; k++) {
      let sp = this.glowPool[k];
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        this.scene.add(sp); this.glowPool.push(sp);
      }
      const c = cands[k];
      const a = c.base * (c.day + night * (1 - c.day)) * far * (1 + Math.sin(this.time * 9 + k * 2.3) * 0.05);
      sp.visible = a > 0.03;
      if (!sp.visible) continue;
      sp.position.set(c.x, c.y + 0.15, c.z);
      sp.material.color.set(c.color);
      sp.material.opacity = Math.min(0.5, a * 0.3);
      sp.scale.setScalar(size * (0.8 + c.base * 0.4));
    }
    for (let k = cands.length; k < this.glowPool.length; k++) this.glowPool[k].visible = false;
  }

  dispose() {
    for (const v of this.views.values()) v.dispose();
    for (const fv of this.folkViews.values()) this.scene.remove(fv.obj);
    for (const av of this.animalViews.values()) this.scene.remove(av.obj);
    for (const lv of this.linkViews.values()) { this.scene.remove(lv.obj); lv.obj.userData.dispose?.(); if (lv.rope) lv.rope.dispose(); }
    if (this.arrRopes) { for (const rp of this.arrRopes.values()) rp.dispose(); this.arrRopes.clear(); }
    for (const sv of this.shipViews.values()) this.removeShip(sv);
    this.shipViews.clear();
    for (const m of this.wxClouds.values()) { this.scene.remove(m); m.geometry.dispose(); }
    for (const m of this.plants.meshes.values()) { this.scene.remove(m); m.dispose(); }
    for (const l of this.lightPool) this.scene.remove(l);
    this.views.clear(); this.folkViews.clear(); this.animalViews.clear(); this.linkViews.clear(); this.wxClouds.clear();
  }
}
