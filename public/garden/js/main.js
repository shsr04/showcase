// Note: Garden entry: renderer, loop, world lifecycle, event routing, autosave.

import * as THREE from 'three';
import { N, SIM_DT, SPACING } from './config.js';
import { OrbitCamera } from './camera.js';
import { Sky } from './sky.js';
import { Fx } from './fx.js';
import { WorldView } from './view.js';
import { Tools } from './tools.js';
import { bindInput } from './input.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { pickSeed, loadWorld, saveWorld, randomSeed, hintSeen, markHint } from './save.js';
import { clamp } from './rand.js';
import { knowRelic } from './econ.js';
import { Spectacle } from './spectacle.js';

const canvas = document.getElementById('view');
const veil = document.getElementById('veil');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  veil.firstElementChild.textContent = 'Garden needs WebGL';
  throw e;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
let pr = Math.min(window.devicePixelRatio || 1, 2);
const prMax = pr;
renderer.setPixelRatio(pr);

const scene = new THREE.Scene();
const oc = new OrbitCamera(innerWidth / innerHeight);
const sky = new Sky(scene, renderer, true);
const fx = new Fx(scene);
const audio = createAudio();
const state = { tool: 'raise', brush: 2.3, brushIdx: 1, hand: false };

let world = null;
let view = null;
let spectacle = null;
const tools = new Tools({ scene, camera: oc.cam, getWorld: () => world, getView: () => view, state, audio, canvas });

function resize() {
  const w = innerWidth; const h = innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  oc.resize(w, h);
}
addEventListener('resize', resize);
resize();

const ui = createUI(document.getElementById('ui-root'), {
  state, tools, audio, cam: oc, getWorld: () => world, showHint: !hintSeen(),
  newSky: () => boot(randomSeed()),
  goSeed: (s) => boot(s),
});
markHint();
const input = bindInput({ canvas, cam: oc, tools, state, ui, audio });
let amb = null;

function boot(seed) {
  if (world) saveWorld(world);
  if (view) view.dispose();
  if (spectacle) spectacle.dispose();
  const r = loadWorld(seed);
  world = r.world;
  // Note: pitch ratio rises with the tier (0, 4, 7, 12 semitones).
  view = new WorldView(scene, world, fx, { onTier: (p, tier) => sound('tier', p, { gain: 0.8, pitch: [1, 1.26, 1.5, 2][Math.min(4, tier) - 1] }) });
  spectacle = new Spectacle({ get world() { return world; }, get view() { return view; }, fx, sky, target: oc.target, snd: (name, opts, p) => sound(name, p || null, opts || {}) });
  tools.clearHistory();
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* Note: history may be blocked. */ }
  const home = world.islands.get('0,0');
  const sv = home && home.buildings.find((b) => b && b.id === 'storehouse');
  if (sv) { const p = view.viewOf(home.id).bPos(sv); oc.target.set(home.wx + p.x, p.y, home.wz + p.z); oc.goal.copy(oc.target); }
  updateBounds();
  acc = 0;
}

function updateBounds() {
  let x0 = 1e9; let x1 = -1e9; let z0 = 1e9; let z1 = -1e9;
  for (const i of world.islands.values()) {
    if (!i.revealed) continue;
    x0 = Math.min(x0, i.wx); x1 = Math.max(x1, i.wx); z0 = Math.min(z0, i.wz); z1 = Math.max(z1, i.wz);
  }
  const m = SPACING * 0.8;
  oc.bounds = { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
}

// Note: world events become particles and sounds near the camera.
const tmpV = new THREE.Vector3();
function evPos(ev) {
  const isl = ev.isl;
  if (!isl) return null;
  const v = view.viewOf(isl.id);
  if (ev.b && v) { const p = v.bPos(ev.b); return { x: isl.wx + p.x, y: p.y, z: isl.wz + p.z }; }
  if (ev.i !== undefined) return { x: isl.wx + ev.i + 0.5 - N / 2, y: isl.cellH(ev.i, ev.j), z: isl.wz + ev.j + 0.5 - N / 2 };
  if (ev.f) return world.folkWorldPos(ev.f);
  return { x: isl.wx, y: isl.cellH(N >> 1, N >> 1), z: isl.wz };
}

function sound(name, p, opts = {}) {
  if (!p) { audio.event(name, opts); return; }
  tmpV.set(p.x, p.y, p.z).project(oc.cam);
  const off = Math.max(Math.abs(tmpV.x), Math.abs(tmpV.y));
  const d = Math.hypot(p.x - oc.target.x, p.z - oc.target.z);
  const gain = clamp(1.1 - d / 70, 0.12, 1) * (off > 1.2 ? 0.35 : 1) * (opts.gain ?? 1);
  audio.event(name, { ...opts, gain, pan: clamp(tmpV.x, -1, 1) * 0.7 });
}

function burst(p, n, r, g, b, sp = 1.4) {
  for (let k = 0; k < n; k++) fx.spark(p.x, p.y + 0.4, p.z, r, g, b, sp);
}

const FEST_COL = { weavers: [1, 0.62, 0.74, 1.25], sailors: [0.6, 0.85, 1, 1.1], potters: [1, 0.72, 0.36, 0.9], carvers: [1, 0.5, 0.2, 0.75] };

// Note: world position of the Great Work (spire isle) for chimes and bursts.
function spirePos() {
  for (const isl of world.islands.values()) {
    if (isl.special !== 'spire' || !isl.revealed) continue;
    const b = isl.buildings.find((q) => q && !q.gone && q.id === 'greatwork');
    const v = view.viewOf(isl.id);
    if (b && v) { const p = v.bPos(b); return { x: isl.wx + p.x, y: p.y + 3.2, z: isl.wz + p.z }; }
    return { x: isl.wx, y: isl.cellH(N >> 1, N >> 1) + 3, z: isl.wz };
  }
  return null;
}

function shipPos(ev) {
  const s = typeof ev.ship === 'object' ? ev.ship : (world.ships || []).find((q) => q.id === ev.ship);
  return s && s.pos ? { x: s.pos.x, y: s.pos.y, z: s.pos.z } : null;
}

function route(ev) {
  if (spectacle) spectacle.onEvent(ev);
  switch (ev.type) {
    case 'reveal': {
      view.onReveal(ev.isl);
      const p = evPos(ev);
      burst({ x: p.x, y: p.y + 3, z: p.z }, 40, 1, 0.95, 0.7, 3);
      sound('discover', p, { gain: 0.7 });
      updateBounds();
      break;
    }
    case 'discover': {
      const r = knowRelic(ev.isl);
      const p = r ? { x: ev.isl.wx + r.i + 0.5 - N / 2, y: ev.isl.cellH(r.i, r.j), z: ev.isl.wz + r.j + 0.5 - N / 2 } : evPos(ev);
      burst(p, 50, 0.8, 1, 0.9, 2.2);
      sound('discover', p);
      break;
    }
    case 'invent': {
      burst({ x: oc.target.x, y: oc.target.y + 1, z: oc.target.z }, 30, 1, 0.85, 0.5, 2.5);
      audio.event('invent', { gain: 0.8 });
      break;
    }
    case 'hammer': { const p = evPos(ev); fx.dust(p.x, p.y + 0.3, p.z, 0.8, 0.7, 0.55); sound('build', p, { gain: 0.6 }); break; }
    case 'built': { const p = evPos(ev); burst(p, 16, 1, 0.9, 0.6, 1.3); for (let k = 0; k < 8; k++) fx.dust(p.x, p.y + 0.1, p.z); sound('built', p); break; }
    case 'crafted': { const p = evPos(ev); burst(p, 4, 1, 0.8, 0.4, 0.8); sound('craft', p, { gain: 0.8 }); break; }
    case 'gathered': { const p = evPos(ev); fx.dust(p.x, p.y + 0.2, p.z, 0.55, 0.65, 0.4); break; }
    case 'born': { const p = evPos(ev); burst(p, 14, 1, 0.7, 0.8, 1.2); sound('born', p); break; }
    case 'court': case 'mourn': {
      const p = evPos(ev);
      if (p && Math.hypot(p.x - oc.target.x, p.z - oc.target.z) < 38) sound(ev.type, p, { gain: 0.7 });
      break;
    }
    case 'arrive': case 'settled': { const p = evPos(ev); burst(p, 12, 0.8, 0.9, 1, 1.2); sound('arrive', p, { gain: 0.8 }); break; }
    case 'bark': { const p = evPos(ev); sound('bark', p, { gain: 0.6, pitch: 0.9 + Math.random() * 0.25 }); break; }
    case 'cluck': { const p = evPos(ev); if (Math.hypot(p.x - oc.target.x, p.z - oc.target.z) < 30) sound('cluck', p, { gain: 0.5, pitch: 0.9 + Math.random() * 0.3 }); break; }
    case 'splash': {
      const p = evPos(ev);
      if (p && Math.hypot(p.x - oc.target.x, p.z - oc.target.z) < 24) {
        for (let k = 0; k < 6; k++) fx.spark(p.x, p.y + 0.1, p.z, 0.7, 0.85, 1, 0.8);
        sound('splash', p, { gain: 0.6, pitch: 0.9 + Math.random() * 0.3 });
      }
      break;
    }
    case 'baa': { const p = evPos(ev); if (Math.hypot(p.x - oc.target.x, p.z - oc.target.z) < 30) sound('baa', p, { gain: 0.5, pitch: 0.85 + Math.random() * 0.4 }); break; }
    case 'chirp': {
      const p = evPos(ev);
      if (Math.hypot(p.x - oc.target.x, p.z - oc.target.z) < 38) sound('chirp', p, { gain: 0.5, pitch: 0.85 + Math.random() * 0.4 });
      break;
    }
    case 'touchdown': { const p = evPos(ev); burst(p, 18, 1, 0.9, 0.6, 1.5); sound('arrival', p, { gain: 1.6 }); break; }
    case 'balloon': { const p = evPos(ev); sound('arrive', p, { gain: 0.35, pitch: 0.7 }); break; }
    case 'pass': {
      const p = evPos(ev);
      for (let k = 0; k < 18; k++) fx.glow.emit(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2, 3.5, 0.16, 0.03, 1, 0.95, 0.85, 0.85, 0, 0.2);
      sound('pass', p);
      break;
    }
    case 'linkstart': { const l = ev.link; const m = l.pts[l.pts.length >> 1]; sound('build', m, { gain: 0.7 }); break; }
    case 'linkhammer': { const l = ev.link; const m = l.pts[ev.end ? l.pts.length - 1 : 0]; fx.dust(m.x, m.y + 0.3, m.z, 0.8, 0.7, 0.55); sound('build', m, { gain: 0.6 }); break; }
    case 'linktier': { const l = ev.link; const m = l.pts[ev.end ? l.pts.length - 1 : 0]; burst(m, 14, 1, 0.9, 0.6, 1.3); for (let k = 0; k < 6; k++) fx.dust(m.x, m.y + 0.1, m.z); sound('built', m); break; }
    case 'linkdone': { const l = ev.link; const m = l.pts[l.pts.length >> 1]; burst(m, 24, 1, 0.95, 0.6, 2); sound('link', m); break; }
    case 'collapse': {
      const p = evPos(ev);
      for (let k = 0; k < 16; k++) fx.dust(p.x, p.y + 0.4, p.z, 0.6, 0.55, 0.5);
      for (let k = 0; k < 6; k++) fx.smoke(p.x, p.y + 0.6, p.z, 1.5, 0.35);
      sound('clear', p, { pitch: 0.6 });
      break;
    }
    case 'fizzle': { const p = evPos(ev); for (let k = 0; k < 12; k++) fx.steam(p.x, p.y + 0.3, p.z, k < 3); sound('water', p, { pitch: 1.2, gain: 0.5 }); break; }
    case 'lit': { const p = evPos(ev); burst(p, 10, 1, 0.7, 0.3, 1.2); sound('fire', p, { gain: 0.5 }); break; }
    case 'festival': {
      const p = evPos({ isl: ev.isl, i: ev.isl.festival ? ev.isl.festival.at.i : N >> 1, j: ev.isl.festival ? ev.isl.festival.at.j : N >> 1 });
      if (ev.seasonal) {
        // Note: seasonal festivals open with an archetype-coloured burst and a pitched chime; the set itself is drawn by the island view.
        const c = FEST_COL[ev.arch] || FEST_COL.weavers;
        burst({ x: p.x, y: p.y + 1.6, z: p.z }, 50, c[0], c[1], c[2], 3);
        burst({ x: p.x, y: p.y + 1.6, z: p.z }, 30, 1, 0.92, 0.7, 2.2);
        sound('festival', p, { gain: 0.9, pitch: c[3] });
        break;
      }
      burst({ x: p.x, y: p.y + 1.5, z: p.z }, 60, 1, 0.8, 0.5, 3);
      burst({ x: p.x, y: p.y + 1.5, z: p.z }, 40, 0.6, 0.8, 1, 3);
      sound('festival', p, { gain: 0.9 });
      break;
    }
    case 'season': { audio.event('invent', { gain: 0.3, pitch: [1.12, 1, 0.89, 0.8][ev.idx] || 1 }); break; }
    case 'art': { const p = evPos(ev); burst(p, ev.repair ? 4 : 10, 1, 0.9, 0.7, 1); sound('craft', p, { gain: 0.6, pitch: 0.8 }); break; }
    case 'gwstage': {
      const p = spirePos();
      if (!p) break;
      const k = clamp((ev.index ?? 0) / 6, 0, 1);
      burst(p, 26, 1, 0.9, 0.6, 2.4);
      sound('chime', p, { gain: 1.1, pitch: 0.8 + k * 0.9 });
      break;
    }
    case 'gwlit': {
      const p = spirePos();
      if (!p) { audio.event('beacon', { gain: 0.9 }); break; }
      burst({ x: p.x, y: p.y + 1.2, z: p.z }, 80, 1, 0.9, 0.55, 4);
      burst({ x: p.x, y: p.y + 1.2, z: p.z }, 40, 1, 1, 0.9, 2);
      sound('beacon', p, { gain: 1.2 });
      break;
    }
    case 'shipdepart': case 'shiparrive': {
      const p = shipPos(ev);
      sound('horn', p, { gain: 0.8, pitch: ev.type === 'shipdepart' ? 1 : 0.85 });
      break;
    }
    case 'colonyland': { const p = shipPos(ev); if (p) { burst({ x: p.x, y: p.y + 1, z: p.z }, 36, 1, 0.95, 0.7, 2.4); sound('discover', p, { gain: 0.7 }); } break; }
    case 'shipland': { const p = shipPos(ev); if (p) sound('horn', p, { gain: 0.45, pitch: 0.7 }); break; }
    case 'visitor': {
      const p = evPos(ev);
      if (p) { burst({ x: p.x, y: p.y + 1, z: p.z }, 14, 0.9, 0.95, 1, 1.4); sound('visitor', p, { gain: 0.8, pitch: ev.kind === 'frigate' ? 0.8 : ev.kind === 'merchant' ? 1.15 : 1 }); }
      break;
    }
    case 'relic': {
      const p = evPos(ev);
      if (p) { burst({ x: p.x, y: p.y + 2, z: p.z }, 70, 0.8, 1, 0.9, 3); sound('relic', p, { gain: 1 }); }
      break;
    }
    case 'deed': {
      const isl = ev.isl;
      if (!isl || ev.x === undefined) break;
      const p = { x: isl.wx + ev.x + 0.5 - N / 2, y: isl.heightAt(ev.x + 0.5, ev.z + 0.5), z: isl.wz + ev.z + 0.5 - N / 2 };
      burst({ x: p.x, y: p.y + 0.6, z: p.z }, 30, 1, 0.9, 0.65, 2);
      sound('deed', p, { gain: 0.9 });
      break;
    }
    case 'vfolk': {
      const p = evPos(ev);
      if (!p) break;
      const col = ev.kind === 'wanderer' ? [0.4, 0.9, 0.95] : ev.kind === 'pilgrim' ? [1, 0.85, 0.5] : [0.9, 0.85, 1];
      burst({ x: p.x, y: p.y + 0.5, z: p.z }, ev.phase === 'arrive' ? 10 : 6, col[0], col[1], col[2], 1.1);
      if (ev.phase === 'arrive' && (ev.kind === 'wanderer' || ev.kind === 'pilgrim')) sound('visitor', p, { gain: 0.5, pitch: ev.kind === 'pilgrim' ? 0.9 : 1.25 });
      break;
    }
    case 'song': {
      const p = evPos(ev);
      if (p) { burst({ x: p.x, y: p.y + 1.2, z: p.z }, 24, 1, 0.9, 0.6, 1.8); sound('chime', p, { gain: 0.9, pitch: 0.75 }); }
      break;
    }
    case 'teach': { const p = evPos(ev); if (p) sound('teach', p, { gain: 0.6 }); break; }
    case 'geyser': { const p = evPos(ev); sound('water', p, { pitch: 0.7, gain: 0.5 }); break; }
    default: break;
  }
}

// Note: sums weather and activity near the camera for the ambient mix.
function ambience() {
  const w = world.weather;
  let rain = 0; let snow = 0;
  for (const e of w.events) {
    const isl = world.islands.get(e.isl);
    if (!isl || Math.hypot(isl.wx - oc.target.x, isl.wz - oc.target.z) > 60) continue;
    const t = e.age / e.life;
    const env = Math.min(1, t * 6, (1 - t) * 4) * (e.max ?? 1);
    if (e.kind === 'rain') rain += env * 0.7; else if (e.kind === 'snow') snow += env * 0.7;
  }
  let fire = 0; let water = 0; let mood = 0; let nIsl = 0; let working = 0; let nearFolk = 0;
  for (const v of view.views.values()) {
    const isl = v.isl;
    if (!isl.revealed) continue;
    mood += isl.mood || 0.6; nIsl++;
    if (Math.hypot(isl.wx - oc.target.x, isl.wz - oc.target.z) > 60) continue;
    fire += v.fireCells.length / 10;
    water += (v.drips ? v.drips.length : 0) / 25;
  }
  for (const f of world.folk) {
    const isl = world.islands.get(f.isle);
    if (!isl || Math.hypot(isl.wx - oc.target.x, isl.wz - oc.target.z) > 40) continue;
    nearFolk++;
    if (f.anim === 'work') working++;
  }
  return {
    time: world.tod, wind: clamp(w.wind.s / 0.9, 0, 1), rain: clamp(rain, 0, 1), snow: clamp(snow, 0, 1),
    mood: nIsl ? mood / nIsl : 0.6, activity: clamp(working / 4, 0, 1), zoom: clamp((oc.zoom - 5) / 65, 0, 1),
    fire: clamp(fire, 0, 1), water: clamp(water, 0, 1), folk: clamp(nearFolk / 10, 0, 1),
  };
}

let acc = 0;
let last = performance.now();
let frames = 0; let ema = 16;
let saveT = 0; let uiT = 0; let boundT = 0; let shadowExt = 0; let started = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ema += (dt * 1000 - ema) * 0.05;
  if (++frames % 90 === 0) {
    if (ema > 26 && pr > 0.7) { pr = Math.max(0.7, pr - 0.15); resize(); }
    else if (ema < 15 && pr < prMax) { pr = Math.min(prMax, pr + 0.1); resize(); }
  }
  acc += dt;
  let n = 0;
  while (acc >= SIM_DT && n < 5) { world.step(SIM_DT); acc -= SIM_DT; n++; }
  if (acc > SIM_DT * 5) acc = 0;
  if (world.events.length) for (const ev of world.events.splice(0)) route(ev);
  input.poll(dt);
  oc.update(dt);
  oc.cam.updateMatrixWorld();
  oc.cam.matrixWorldInverse.copy(oc.cam.matrixWorld).invert();
  spectacle.update(dt);
  view.extraWind = spectacle.wind;
  const haze = sky.update(world, dt, oc.target, oc.cam);
  spectacle.post(sky);
  const ext = Math.round(clamp(oc.zoom * 1.7, 24, 64));
  if (ext !== shadowExt) {
    shadowExt = ext;
    const sc = sky.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
  }
  view.update(dt, oc.target, oc.cam, sky, haze);
  tools.update(dt, now / 1000);
  fx.update(dt, oc.cam, canvas.height);
  uiT -= dt;
  if (uiT <= 0) { uiT = 0.1; ui.update(world); }
  boundT -= dt;
  if (boundT <= 0) { boundT = 0.5; updateBounds(); amb = ambience(); }
  audio.update(dt, amb);
  saveT += dt;
  if (saveT > 15) { saveT = 0; saveWorld(world); }
  renderer.render(scene, oc.cam);
  if (!started) { started = true; requestAnimationFrame(() => { veil.classList.add('gone'); setTimeout(() => veil.remove(), 1600); }); }
}

addEventListener('pagehide', () => { if (world) saveWorld(world); });
document.addEventListener('visibilitychange', () => { if (document.hidden && world) saveWorld(world); });

boot(pickSeed());
requestAnimationFrame(frame);

// Note: debug and test hook.
window.__garden = {
  get world() { return world; },
  get view() { return view; },
  get spectacle() { return spectacle; },
  oc, tools, state, sky, fx, audio, renderer, ui,
  advance(sec) { for (let t = 0; t < sec; t += SIM_DT) world.step(SIM_DT); },
  boot,
};
