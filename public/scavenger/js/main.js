// Note: entry point; boots textures and the world, then runs input, simulation and rendering.

import * as THREE from 'three';
import { World, cellOf } from './plan.js';
import { DISTRICTS, DEFAULT_SEED, evalStyles } from './config.js';
import { buildTextureBank, buildFontAtlas } from './textures.js';
import { createTextureArray, createWorldMaterial, Post } from './render.js';
import { WorldView } from './world.js';
import { createSky } from './sky.js';
import { Ship, forwardOf, rightOf, angleDiff, SPEED } from './ship.js';
import { Drift } from './drift.js';
import { Gear } from './gear.js';
import { Fx } from './fx.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { createAudio } from './audio.js';
import { Logbook } from './logbook.js';
import { PoiTracker } from './poi.js';
import { seedFromString, clamp } from './rand.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const normSeed = (v) => (v || DEFAULT_SEED).trim().toUpperCase().slice(0, 24) || DEFAULT_SEED;

const QUALITY = {
  low: { scale: 0.6, depth: 2, reach: 340, detail: 0, ao: false, bloom: 0.4, dust: 0.4, adaptive: false },
  medium: { scale: 0.85, depth: 2.8, reach: 460, detail: 1, ao: true, bloom: 0.55, dust: 0.8, adaptive: false },
  high: { scale: 1.0, depth: 3.2, reach: 560, detail: 1, ao: true, bloom: 0.6, dust: 1, adaptive: false },
  auto: { scale: 0.85, depth: 2.8, reach: 460, detail: 1, ao: true, bloom: 0.55, dust: 0.8, adaptive: true },
};

const game = {
  params,
  quality: QUALITY[params.get('q')] ? params.get('q') : 'auto',
  seed: normSeed(params.get('seed')),
  time: 0,
  mode: 'title',
  playing: false,
  ready: false,
  cam: new THREE.Vector3(),
  stats: {},
  frames: 0,
  ctl: { roll: 0 },
};
window.__tg = game;

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.classList.remove('is-hidden');
}

function setBoot(frac, text) {
  $('bootBar').style.width = `${Math.round(frac * 100)}%`;
  if (text) $('bootText').textContent = text;
}

function startPose(world) {
  const plan = world.cell(world.start[0], world.start[1], world.start[2]);
  const c = plan.room ? plan.room.c.slice() : plan.c.slice();
  if (plan.room) c[1] = plan.room.c[1] - plan.room.h[1] + 3;
  let yaw = 0;
  const stub = plan.stubs[0];
  if (stub) yaw = Math.atan2(-stub.dir[0], -stub.dir[2]);
  return { pos: c, yaw };
}

// Note: canvas text needs the web font ready up front; a slow or blocked font falls back to the system monospace.
async function loadFont() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([document.fonts.load('32px "VT323"'), new Promise((r) => setTimeout(r, 2000))]);
  } catch (e) {
    // Note: nothing to do; the fallback face is already in the font stack.
  }
}

async function boot() {
  const canvas = $('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (e) {
    fatal('WebGL2 is required for Scavenger.');
    return;
  }
  if (!renderer.capabilities.isWebGL2) {
    fatal('WebGL2 is required for Scavenger.');
    return;
  }
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 1);
  game.renderer = renderer;
  let q = QUALITY[game.quality];
  game.q = q;
  const scaleOverride = parseFloat(params.get('scale') || '');
  game.scale = Number.isFinite(scaleOverride) ? scaleOverride : q.scale;
  game.adaptive = q.adaptive && !Number.isFinite(scaleOverride);

  setBoot(0.02, 'Etching textures...');
  await loadFont();
  const bank = await buildTextureBank((i, n) => setBoot(0.02 + 0.4 * (i / n), 'Etching textures...'), () => new Promise((r) => setTimeout(r, 0)));
  const texArray = createTextureArray(bank);
  const atlas = buildFontAtlas();
  const fontTex = new THREE.CanvasTexture(atlas.canvas);
  fontTex.colorSpace = THREE.NoColorSpace;
  fontTex.minFilter = THREE.LinearMipmapLinearFilter;
  fontTex.anisotropy = 4;
  setBoot(0.45, 'Painting the void...');
  await new Promise((r) => setTimeout(r, 0));
  const firstWorld = new World(game.seed);
  let sky = createSky(firstWorld.seed % 1000, 256);
  sky.seedKey = firstWorld.seed;
  game.sky = sky;
  const { material, uniforms } = createWorldMaterial(texArray, fontTex, sky.texture);
  uniforms.uSkySeed.value = firstWorld.seed % 1000;
  uniforms.uHullA.value.set(sky.hulls.A);
  uniforms.uHullB.value.set(sky.hulls.B);
  game.uniforms = uniforms;
  game.atlas = atlas;

  const scene = new THREE.Scene();
  game.scene = scene;
  const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 900);
  game.camera = camera;
  const post = new Post(renderer);
  post.params.bloom = q.bloom;
  const nost = parseFloat(params.get('nost') || '');
  if (Number.isFinite(nost)) post.params.nostalgia = nost;
  game.post = post;

  const hud = new Hud();
  game.hud = hud;
  const input = new Input(canvas, $('touch'));
  game.input = input;
  const audio = createAudio();
  game.audio = audio;
  const fx = new Fx(scene, uniforms);
  game.fx = fx;

  let view = null;
  let ship = null;
  let gear = null;
  let drift = null;
  let pois = null;

  function disposeWorld() {
    if (view) view.dispose();
    fx.dispose();
  }

  async function loadWorld(seedStr, progress) {
    disposeWorld();
    const world = firstWorld.seedStr === seedStr ? firstWorld : new World(seedStr);
    game.world = world;
    game.seed = world.seedStr;
    if (world !== firstWorld || sky.seedKey !== world.seed) {
      const old = sky.texture;
      sky = createSky(world.seed % 1000, 256);
      sky.seedKey = world.seed;
      uniforms.uSky.value = sky.texture;
      uniforms.uSkySeed.value = world.seed % 1000;
      uniforms.uHullA.value.set(sky.hulls.A);
      uniforms.uHullB.value.set(sky.hulls.B);
      game.sky = sky;
      if (old !== sky.texture) old.dispose();
    }
    view = new WorldView(world, scene, material, atlas, {
      depth: q.depth, reach: q.reach, detail: q.detail, ao: q.ao, onCell: () => fx.markDirty(), onCellGone: () => fx.markDirty(),
    });
    game.view = view;
    ship = new Ship(world);
    gear = new Gear(world, seedFromString(world.seedStr) ^ 0x6ea7);
    drift = new Drift(world, seedFromString(world.seedStr) ^ 0xd21f7);
    pois = new PoiTracker(world, world.seedStr);
    drift.isSeen = (id) => pois.isSeen(id);
    game.ship = ship;
    game.gear = gear;
    game.drift = drift;
    game.pois = pois;
    const pose = startPose(world);
    ship.place(pose.pos, pose.yaw, 0);
    const camParam = params.get('cam');
    if (camParam && !game.camApplied) {
      game.camApplied = true;
      const v = camParam.split(',').map(Number);
      if (v.length >= 3) ship.place([v[0], v[1], v[2]], ((v[3] || 0) * Math.PI) / 180, ((v[4] || 0) * Math.PI) / 180);
    }
    audio.setWorld(world);
    syncLogs();
    $('titleKicker').textContent = `${world.seedStr} // SERVICE LINK 7.3`;
    await view.preload(ship.pos, 2, progress);
  }

  // Note: keeps the HUD counter and the title button in step with the collected logs.
  function syncLogs() {
    hud.setLogs(pois.seen.size, 0);
    $('btnLogs').textContent = pois.entries.length ? `Logbook (${pois.entries.length})` : 'Logbook';
  }

  setBoot(0.5, 'Waking the station...');
  await loadWorld(game.seed, (r, t) => setBoot(0.5 + 0.5 * (r / Math.max(1, t)), `Waking the station... ${r}/${t}`));
  setBoot(1, 'Systems ready.');
  game.ready = true;

  const camRig = {
    fov: 78, roll: 0, shake: 0, yawRate: 0, lastYaw: 0, bobT: 0, level: 0,
  };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const skyM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const tmpR = new THREE.Vector3();
  const tmpU = new THREE.Vector3();
  const fogTarget = new THREE.Color();

  function applyScale() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    post.resize(window.innerWidth * dpr, window.innerHeight * dpr, game.scale);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyScale();
  }
  window.addEventListener('resize', resize);
  resize();

  // Note: title, pause and options.
  const title = $('title');
  const touchRoot = $('touch');
  const touchUi = window.matchMedia('(pointer: coarse)').matches;
  const btnFly = $('btnFly');
  const btnDrift = $('btnDrift');
  const logbook = new Logbook();
  const optSeed = $('optSeed');
  const optQuality = $('optQuality');
  const optNost = $('optNostalgia');
  const optSound = $('optSound');
  optQuality.value = game.quality;
  optSeed.value = game.seed;
  optNost.value = String(Math.round(post.params.nostalgia * 100));
  optSound.checked = params.get('mute') !== '1';
  optNost.addEventListener('input', () => {
    post.params.nostalgia = Number(optNost.value) / 100;
  });

  let busy = false;
  async function applyOptions() {
    const qn = optQuality.value;
    if (qn !== game.quality && QUALITY[qn]) {
      game.quality = qn;
      q = QUALITY[qn];
      game.q = q;
      game.adaptive = q.adaptive;
      game.scale = q.scale;
      post.params.bloom = q.bloom;
      view.depth = q.depth;
      view.reach = q.reach;
      view.detail = q.detail;
      view.ao = q.ao;
      applyScale();
    }
    const seedStr = normSeed(optSeed.value);
    optSeed.value = seedStr;
    if (seedStr !== game.world.seedStr) {
      busy = true;
      btnFly.disabled = true;
      btnDrift.disabled = true;
      setBoot(0.05, 'Rebuilding the station...');
      await new Promise((r) => setTimeout(r, 30));
      await loadWorld(seedStr, (r, t) => setBoot(0.1 + 0.9 * (r / Math.max(1, t)), `Waking the station... ${r}/${t}`));
      setBoot(1, 'Systems ready.');
      btnFly.disabled = false;
      btnDrift.disabled = false;
      busy = false;
    }
    audio.setMuted(!optSound.checked);
  }

  function setMode(mode) {
    game.mode = mode;
    hud.setMode(mode === 'drift' ? 'DRIFT' : mode === 'fly' ? 'MANUAL' : 'PAUSED');
    hud.reticle.style.display = mode === 'fly' ? '' : 'none';
    if (mode === 'drift') drift.reset(ship);
  }

  async function startPlay(mode) {
    if (busy) return;
    if (mode === 'fly') input.requestLock();
    await applyOptions();
    camRig.lastYaw = ship.yaw;
    camRig.yawRate = 0;
    title.classList.add('is-gone');
    canvas.classList.add('is-playing');
    if (touchUi) touchRoot.classList.add('is-on');
    hud.show(true);
    input.setEnabled(true);
    game.playing = true;
    setMode(mode);
    audio.start();
    audio.setMuted(!optSound.checked);
    if (!game.introShown) {
      game.introShown = true;
      const hint = touchUi
        ? mode === 'drift' ? 'DRIFT ENGAGED // DRAG LEFT TO TAKE OVER' : 'LEFT: MOVE // RIGHT: LOOK'
        : mode === 'drift' ? 'DRIFT ENGAGED // MOVE ANY KEY TO TAKE OVER' : 'WASD + MOUSE // H FOR HELP';
      hud.toast(hint, 4.5);
    }
  }

  function pause() {
    if (!game.playing) return;
    game.playing = false;
    input.setEnabled(false);
    audio.suspend();
    setMode('paused');
    title.classList.remove('is-gone');
    canvas.classList.remove('is-playing');
    touchRoot.classList.remove('is-on');
    $('titleKicker').textContent = 'LINK HELD // PAUSED';
    btnFly.disabled = false;
    btnDrift.disabled = false;
  }

  btnFly.addEventListener('click', () => startPlay('fly'));
  btnDrift.addEventListener('click', () => startPlay('drift'));
  $('btnLogs').addEventListener('click', () => logbook.show(pois.seedStr, pois.entries));
  window.addEventListener('keydown', (e) => {
    if (!game.playing && game.ready && !logbook.open && e.code === 'Enter' && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'BUTTON') startPlay('fly');
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && logbook.open) logbook.hide();
    else if (e.code === 'Escape' && game.playing && !input.locked) pause();
  });
  input.onLockChange = (locked) => {
    if (!locked && game.playing && !input.touch.active && !game.noPause) pause();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend();
    else if (game.playing) audio.resume();
  });

  // Note: actions bound to keys and buttons.
  input.on('lamp', () => {
    gear.lamp = !gear.lamp;
    hud.toast(gear.lamp ? 'HEADLAMP ON' : 'HEADLAMP OFF', 1.4);
    audio.click('lamp');
  });
  let stickCool = 0;
  input.on('stick', () => {
    if (stickCool > 0) return;
    stickCool = 0.3;
    const f = forwardOf(ship.yaw, ship.pitch);
    gear.throwStick(ship.pos, f, ship.vel);
    audio.stick();
  });
  input.on('ping', () => {
    if (gear.ping.t < 1.2) return;
    gear.startPing(ship.pos);
    audio.ping();
    const hint = pois.hint(ship.pos);
    if (hint) hud.toast(hint, 3.6);
  });
  input.on('menu', () => pause());
  input.on('help', () => hud.toggleHelp());
  input.on('drift', () => {
    if (game.mode === 'drift') {
      setMode('fly');
      hud.toast('MANUAL CONTROL', 1.6);
    } else {
      setMode('drift');
      hud.toast('DRIFT ENGAGED', 1.8);
    }
    if (game.mode === 'fly') input.requestLock();
  });
  input.on('mute', () => {
    audio.setMuted(!audio.muted);
    optSound.checked = !audio.muted;
    hud.toast(audio.muted ? 'SOUND OFF' : 'SOUND ON', 1.4);
  });
  input.on('level', () => {
    camRig.level = 0.7;
  });
  input.on('hud', () => hud.setVisible(!hud.visible));
  input.on('nostalgia', () => {
    const steps = [0, 0.25, 0.5, 0.8, 1];
    const cur = post.params.nostalgia;
    let next = steps.find((s) => s > cur + 0.01);
    if (next === undefined) next = 0;
    post.params.nostalgia = next;
    optNost.value = String(Math.round(next * 100));
    hud.toast(`NOSTALGIA ${Math.round(next * 100)}%`, 1.4);
  });

  // Note: frame loop pieces.
  let hudAcc = 0;
  let lastCell = '';
  let perfAcc = 0;
  let perfN = 0;
  let perfGood = 0;

  function simulate(dt) {
    const ctl = input.poll();
    game.ctl = ctl;
    stickCool -= dt;
    if (game.mode === 'drift') {
      if (input.consumeTakeover()) {
        setMode('fly');
        input.requestLock();
        hud.toast('MANUAL CONTROL', 1.4);
      } else {
        const dctl = drift.update(ship, dt);
        dctl.yawD += ctl.yawD * 0.15;
        ship.step(dt, dctl);
      }
    }
    if (game.mode === 'fly') {
      input.takeover = false;
      if (camRig.level > 0) {
        camRig.level -= dt;
        ship.pitch += (0 - ship.pitch) * (1 - Math.exp(-6 * dt));
      }
      ship.step(dt, ctl);
    }
    gear.update(dt);
    if (ship.bump > 1.6) {
      camRig.shake = Math.max(camRig.shake, clamp(ship.bump / 9, 0.15, 1));
      audio.bump(ship.bump);
    }
    const r = rightOf(ship.yaw);
    const lat = (ship.vel[0] * r[0] + ship.vel[2] * r[2]) / SPEED.cruise;
    const yawRate = angleDiff(ship.yaw, camRig.lastYaw) / Math.max(dt, 1e-3);
    camRig.lastYaw = ship.yaw;
    camRig.yawRate += (yawRate - camRig.yawRate) * (1 - Math.exp(-8 * dt));
    const rollTarget = -(ctl.roll || 0) * 0.5 - clamp(lat, -1, 1) * 0.09 - clamp(camRig.yawRate, -2, 2) * 0.06;
    camRig.roll += (rollTarget - camRig.roll) * (1 - Math.exp(-5 * dt));
    const ev = pois.update(ship, dt, forwardOf(ship.yaw, ship.pitch));
    if (ev) {
      hud.log(ev.title, ev.text);
      syncLogs();
      audio.log();
    }
  }

  function updateCamera(dt) {
    const sp = ship.speed;
    camRig.bobT += dt;
    camRig.shake *= Math.exp(-5.5 * dt);
    const targetFov = 76 + clamp(sp / SPEED.boost, 0, 1) * 16;
    camRig.fov += (targetFov - camRig.fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(camera.fov - camRig.fov) > 0.05) {
      camera.fov = camRig.fov;
      camera.updateProjectionMatrix();
    }
    const t = camRig.bobT;
    const sh = camRig.shake;
    const swayX = Math.sin(t * 0.7) * 0.012 + (Math.random() - 0.5) * 0.05 * sh;
    const swayY = Math.sin(t * 0.93 + 1) * 0.01 + (Math.random() - 0.5) * 0.05 * sh;
    euler.set(ship.pitch + Math.sin(t * 0.51) * 0.002 + (Math.random() - 0.5) * 0.02 * sh, ship.yaw, camRig.roll + (Math.random() - 0.5) * 0.03 * sh);
    camera.quaternion.setFromEuler(euler);
    tmpR.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tmpU.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.set(ship.pos[0], ship.pos[1], ship.pos[2]);
    camera.position.addScaledVector(tmpR, swayX);
    camera.position.addScaledVector(tmpU, swayY);
    game.cam.copy(camera.position);
  }

  function updateUniforms(dt) {
    const camPos = camera.position;
    evalStyles(game.time, uniforms.uStyles.value);
    uniforms.uTime.value = game.time;
    const c = cellOf(camPos.x, camPos.y, camPos.z);
    const di = game.world.districtIndex(c[0], c[1], c[2]);
    const D = DISTRICTS[di];
    fogTarget.setRGB(D.fog[0], D.fog[1], D.fog[2]);
    const k = 1 - Math.exp(-1.6 * dt);
    uniforms.uFogColor.value.lerp(fogTarget, k);
    // Note: long runs and big voids thin the fog so the distance shows.
    const fogK = game.world.cell(c[0], c[1], c[2]).fogK;
    uniforms.uFogDensity.value += (D.fogDensity * fogK - uniforms.uFogDensity.value) * k;
    skyM.makeRotationY(game.time * 0.01);
    uniforms.uSkyMat.value.setFromMatrix4(skyM);
    // Note: headlamp sits a little right and below the eye so surfaces show relief.
    const lampOn = gear.lamp;
    tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion);
    uniforms.uHeadDir.value.copy(tmpV);
    uniforms.uHead.value.set(
      camPos.x + tmpR.x * 0.3 - tmpU.x * 0.2,
      camPos.y + tmpR.y * 0.3 - tmpU.y * 0.2,
      camPos.z + tmpR.z * 0.3 - tmpU.z * 0.2,
      lampOn ? 1 : 0,
    );
    // Note: nearest glowsticks feed the six per-pixel point lights.
    const sticks = gear.sticks;
    for (let i = 0; i < 6; i++) {
      const s = sticks[i];
      const pos = uniforms.uGlowPos.value[i];
      const col = uniforms.uGlowCol.value[i];
      if (!s) {
        pos.w = 0;
        continue;
      }
      const br = 1.25 + 0.15 * Math.sin(game.time * 2.3 + i);
      pos.set(s.p[0], s.p[1], s.p[2], 16);
      col.set(s.color[0] * br, s.color[1] * br, s.color[2] * br);
    }
    const ping = gear.pingState();
    uniforms.uPing.value.set(ping.origin[0], ping.origin[1], ping.origin[2], ping.radius);
    uniforms.uPingA.value = ping.alpha;
    fx.update(game.time, camera, post.height, gear, view, game.world, clamp(0.5 + D.fail, 0.3, 1) * q.dust);
    game.district = di;
  }

  function updateHud(dt) {
    hud.update(dt);
    hudAcc += dt;
    if (hudAcc < 0.12) return;
    hudAcc = 0;
    const c = cellOf(ship.pos[0], ship.pos[1], ship.pos[2]);
    const key = c.join(',');
    if (key !== lastCell) {
      lastCell = key;
      const D = DISTRICTS[game.world.districtIndex(c[0], c[1], c[2])];
      hud.setPlace(D.name, game.world.sector(c[0], c[1], c[2]));
    }
    hud.setSpeed(ship.speed);
    hud.setPos(ship.pos);
  }

  function adapt(dtRaw) {
    if (!game.adaptive || !game.playing) return;
    // Note: a stalled or stale frame (hidden tab, long pause) says nothing about steady speed.
    if (dtRaw > 1 || dtRaw <= 0) {
      perfAcc = 0;
      perfN = 0;
      return;
    }
    perfAcc += dtRaw;
    perfN++;
    if (perfAcc < 1.5) return;
    const fps = perfN / perfAcc;
    perfAcc = 0;
    perfN = 0;
    if (fps < 42 && game.scale > 0.5) {
      game.scale = Math.max(0.5, game.scale - 0.1);
      perfGood = 0;
      applyScale();
    } else if (fps > 57) {
      perfGood++;
      if (perfGood >= 3 && game.scale < 1.0) {
        game.scale = Math.min(1.0, game.scale + 0.05);
        perfGood = 0;
        applyScale();
      }
    } else {
      perfGood = 0;
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = (now - last) / 1000;
    last = now;
    // Note: a stale first frame time can predate `last`; a negative dt wrecks the autopilot, so dt floors at zero.
    const dt = clamp(dtRaw, 0, 0.05);
    game.time += dt;
    if (game.playing) simulate(dt);
    else if (game.mode === 'title') {
      // Note: the title backdrop drifts slowly so the scene feels alive behind the menu.
      ship.yaw += Math.sin(game.time * 0.11) * 0.0006;
    }
    view.update(ship.pos, game.playing ? 4 : 10);
    updateCamera(dt);
    updateUniforms(dt);
    updateHud(dt);
    audio.update(dt, {
      pos: ship.pos, vel: ship.vel, speed: ship.speed, clear: ship.clear, forward: forwardOf(ship.yaw, ship.pitch), up: [tmpU.x, tmpU.y, tmpU.z], world: game.world, time: game.time, district: game.district, playing: game.playing,
    });
    post.render(scene, camera, game.time);
    game.stats = view.stats();
    game.frames++;
    adapt(dtRaw);
  }
  requestAnimationFrame(frame);

  // Note: hooks used by automated checks and screenshots.
  game.tp = async (x, y, z, yawDeg = 0, pitchDeg = 0) => {
    ship.place([x, y, z], (yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180);
    camRig.lastYaw = ship.yaw;
    await view.preload(ship.pos, 2);
  };
  game.start = (mode) => startPlay(mode);
  game.setMode = setMode;

  const auto = params.get('auto');
  if (auto || params.get('mode')) {
    game.noPause = true;
    gear.lamp = params.get('lamp') !== '0';
    await startPlay(params.get('mode') === 'drift' ? 'drift' : 'fly');
  }
  btnFly.disabled = false;
  btnDrift.disabled = false;
}

boot().catch((e) => {
  console.error(e);
  fatal(`Startup failed: ${e && e.message ? e.message : e}`);
});
