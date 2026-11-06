// Note: GameScene runs one life: world, cars, people, combat, encounters, survival, radio, HUD and the ironman save.

import { VIEW_W, VIEW_H, TILE, CELL, DENSE, HOUR_SECONDS, MILES_PER_PX, MPH_PX, WOUND_MAX } from './config.js';
import { TILE_PROPS, T } from './tiles.js';
import { C, hexNum } from './palette.js';
import { seedFromString, clamp, angleDiff } from './rand.js';
import { makeBand, cellAt, cellAtPx, cellPropsAtPx, siteById, onBackRoad, roadX } from './worldgen.js';
import { ChunkLayer, buildRoofs, holeKey, paintRoof, paintStruct } from './chunks.js';
import { makeCar, stepCar, carCircles, collideCars, collideCircle, collideTiles, applyImpact, tryStart, speedOf } from './car.js';
import { installedParts, carStats, hitCar, SLOTS, SLOT_LABEL, wearLabel, fits, tierOf, partLabel } from './parts.js';
import { VEHICLE, COURIER_CAR, partName } from './vehicles.js';
import { capacityOf, handsCap, itemLabel, carryable, addItem, removeItem, waterUnits, takeWater, addWater, pourCans } from './inventory.js';
import { carKey, paintFor, personKey, propKey, bodyKey } from './sprites.js';
import { Input } from './input.js';
import { newState, newId, courierCar } from './state.js';
import { writeSave, deleteSave, loadSave } from './save.js';
import { stepSurvival, drink, addWound, isDead, stepHeat, bumpHeat, hunterStage, darkness, isNight, clockText, adjustStanding, refuses, standingOf } from './survival.js';
import {
  OBJECTIVES, DEATHS, AMBIENT, ALERTS, SPOT, clerkVoice, preacherVoice, hunterName, mechanicHunterLine,
  ACT_OBJECTIVES, ACT_ARRIVAL, actCard, woodvilleVoice, seminoleVoice, residentsVoice, docVoice, transmitterVoice, buyerVoice,
} from './story.js';
import { STATIONS, signalOf, nextLine } from './radio.js';
import { WEAPONS, inArc, Bullets, makeEnemy, stepEnemy, hurtEnemy, ramEnemy, enemyWreck, enemyRunner, drivable, isBike } from './combat.js';
import { stepFoot, stepGuard, makeGuard, alertGuard, hearNoise, sees, los, pushOut, turnToward, FOOT_R } from './actors.js';
import { planEncounters, Director, CHECKPOINT_Y, gateY } from './encounters.js';
import { Hud, esc } from './hud.js';
import { Lighting } from './lighting.js';
import { lootList, takeLoot, spendAmmo, ammoTotal, canPay, pay, COSTS, installPart, swapBig, donorOffers, towHours } from './services.js';
import { makeTutorial, TUTORIAL_STEPS } from './tutorial.js';
import { LAST_ACT, actOf } from './acts.js';
import { ending } from './endings.js';
import { Hazards } from './hazards.js';
import { rainAt } from './weather.js';

const D = { STRUCT: 2, PROP: 8, HAZARD: 9, WRECK: 10, CAR: 20, CONE: 22, PERSON: 25, BULLET: 30, CANOPY: 36, ROOF: 40, RETICLE: 50, RAIN: 55, LIGHT: 60 };
const STEP = 1 / 120;
const UP = -Math.PI / 2;
const END_DELAY = 2.5;
// Note: camera lead in seconds of travel, capped per axis; the corridor runs vertically.
const LEAD_T = 0.45;
const LEAD_X = 30;
const LEAD_Y = 70;
// Note: on foot the camera glides in to 2x, where people, rooms and props are drawn at full detail.
const FOOT_ZOOM = 2;
// Note: canopy hole radius in world px by sprite density, wide around the car and tight around the courier.
const CANOPY_HOLE = { 1: 30, 2: 18 };
// Note: one-time favors that every band offers again.
const BAND_FLAGS = ['preacherTalked', 'churchWater'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'game' });
  }

  // ---------------------------------------------------------------- setup

  create(data) {
    // Note: Phaser auto-starts the first scene with no data; the real start comes from the title screen.
    this.idle = !data || !data.app;
    if (this.idle) return;
    this.app = data.app;
    this.audio = this.app.audio;
    this.tutorial = data.mode === 'tutorial';
    this.hud = new Hud();
    this.over = false;
    this.paused = false;
    if (data.mode === 'continue') {
      this.S = data.save;
      // Note: saves from before Act 2 existed resume in Act 1 with the hunter still out.
      this.S.act ??= 1;
      this.S.hunter ??= 'hunting';
      // Note: a fight in progress at save time starts over when the courier comes back.
      for (const k of Object.keys(this.S.enc)) if (this.S.enc[k] !== 'done') delete this.S.enc[k];
    } else {
      this.S = newState(data.seed, data.name, this.tutorial ? 'level' : 'band');
    }
    const S = this.S;
    this.world = this.tutorial ? makeTutorial() : makeBand(S.seed, S.act);
    this.exitY = this.world.exitX ? this.world.exitX * TILE : null;
    this.hunter = hunterName(S.seed);
    // Note: tree crowns sit above cars and people; a dithered hole around the courier keeps them visible underneath.
    this.canopy = this.add.layer().setDepth(D.CANOPY);
    this.canopyHole = this.make.image({ x: 0, y: 0, key: holeKey(this, CANOPY_HOLE[1]) }, false);
    this.canopy.enableFilters().filters.internal.addMask(this.canopyHole, true);
    this.chunks = new ChunkLayer(this, this.world, 0, this.canopy);
    this.env = {
      surface: (x, y) => cellPropsAtPx(this.world, x, y),
      solid: (cx, cy) => TILE_PROPS[cellAt(this.world, cx, cy)].solidCar,
    };
    this.wrecks = [];
    this.runners = [];
    this.crates = [];
    this.people = [];
    this.enemies = [];
    this.barriers = [];
    this.props = [];
    this.extraLights = [];
    this.flashes = [];
    this.barks = [];
    this.carViews = new Map();
    this.storyObjs = [];
    this.voice = null;
    this.panelState = null;
    this.payWith = 'water';
    this.reloadT = 0;
    this.fireT = 0;
    this.meleeT = 0;
    this.drawn = false;
    this.crankT = 0;
    this.radioT = 4;
    this.heatT = 0;
    this.idleT = 0;
    this.saveT = 0;
    this.hudT = 0;
    this.stepT = 0;
    this.acc = 0;
    // Note: a restarted scene starts at the zoom its mode wants, with fresh sprite densities.
    this.zoom = null;
    this.lod = 1;
    this.camLead = null;
    this.realT = 0;
    this.curEnc = null;
    this.duskDay = 0;
    this.ending = null;
    this.noCaseWarned = false;
    this.buildRoofs();
    this.setupEntities();
    const arrived = !!S.arrive;
    if (data.mode !== 'continue') this.setupStart();
    else if (arrived) this.setupArrival();
    for (const id of Object.keys(S.cars)) this.addCarView(S.cars[id]);
    this.foot = { x: S.p.x, y: S.p.y, a: S.p.a, vx: 0, vy: 0, walk: 0 };
    this.footSpr = this.skin(this.add.image(S.p.x, S.p.y, personKey(this, 'courier', 0)), (d) => personKey(this, 'courier', 0, false, d)).setDepth(D.PERSON);
    this.bullets = new Bullets(this, D.BULLET);
    this.hazards = new Hazards(this.add.graphics().setDepth(D.HAZARD));
    this.rain = 0;
    this.rainOn = false;
    this.drops = [];
    this.rainG = this.add.graphics().setDepth(D.RAIN).setScrollFactor(0);
    this.cones = this.add.graphics().setDepth(D.CONE);
    this.reticle = this.add.graphics().setDepth(D.RETICLE);
    this.lighting = new Lighting(this, D.LIGHT);
    this.director = new Director(this, planEncounters(this.world));
    this.input2 = new Input(document.getElementById('stage'), VIEW_W, VIEW_H);
    this.tut = this.tutorial ? { step: 0 } : null;
    this.motelY = this.world.start ? this.world.start.y : this.world.h * TILE;
    this.onHide = () => {
      if (document.visibilityState === 'hidden') this.autosave(true);
    };
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onHide);
    this.events.once('shutdown', () => this.teardown());
    this.wirePause();
    this.debugHooks();
    if (data.mode === 'new' && !this.tutorial) this.hud.toast('Bayou Rest Motor Court.', 5);
    if (data.mode === 'continue') this.hud.toast(arrived ? ACT_ARRIVAL[S.act] : `Day ${S.day}.`, arrived ? 5 : 3);
    this.updateCamera();
  }

  buildRoofs() {
    // Note: buildings and roofs are cell-grid images at double density, shown at half scale.
    this.structs = this.world.structs.map((st) => {
      const key = `struct:${this.world.seedStr}:${this.world.kind}:${st.id}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, paintStruct(st, this.world.seed));
      const img = this.add.image(st.x * CELL, st.y * CELL, key).setOrigin(0, 0).setScale(1 / DENSE).setDepth(D.STRUCT);
      return { key, img };
    });
    this.roofs = buildRoofs(this.world).map((r) => {
      const key = `roof:${this.world.seedStr}:${r.id}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, paintRoof(r, this.world.seed));
      const img = this.add.image(r.x0 * CELL, r.y0 * CELL, key).setOrigin(0, 0).setScale(1 / DENSE).setDepth(D.ROOF);
      return { ...r, key, img, alpha: 1, doors: r.doors.map((d) => ({ x: d.x * CELL, y: d.y * CELL, w: d.w * CELL, h: d.h * CELL, seen: false, a: 0 })) };
    });
    this.doorG?.destroy();
    this.doorG = this.add.graphics().setDepth(D.ROOF + 1);
    this.doorT = 0;
  }

  // Note: generated entities are re-applied with the run's deltas (mut, gone, dyn).
  setupEntities() {
    const S = this.S;
    const W = this.world;
    const apply = (e) => {
      const m = S.mut[e.id];
      if (m) Object.assign(e, JSON.parse(JSON.stringify(m)));
      return e;
    };
    for (const e of W.wrecks) if (!S.gone[e.id]) this.addWreck(apply(e));
    for (const e of S.dyn) if (e.kind === 'runner') this.addRunner(e); else this.addWreck(e);
    for (const e of W.runners) if (!S.gone[e.id]) this.addRunner(apply(e));
    for (const e of W.loot) if (!S.gone[e.id]) this.addCrate(apply(e));
    for (const e of W.npcs) if (!S.gone[e.id]) this.addPerson({ ...e, look: e.role === 'buyer' ? e.faction : e.role, npc: true });
    for (const e of W.guards) if (!S.gone[e.id]) this.addPerson({ ...e, look: e.faction, armed: true, guard: true });
    for (const e of W.story) {
      if (e.story === 'residents' && !S.flags.surveyFull) this.storyObjs.push({ id: 'half', x: e.x, y: e.y, spr: this.skin(this.add.image(e.x, e.y, propKey(this, 'folder')), (d) => propKey(this, 'folder', d)).setDepth(D.PROP + 1) });
      if (e.story === 'tower') this.storyObjs.push({ id: 'transmitter', x: e.x, y: e.y, spr: this.skin(this.add.image(e.x, e.y, propKey(this, 'radio')), (d) => propKey(this, 'radio', d)).setDepth(D.PROP + 1) });
      if (e.story !== 'motel') continue;
      this.storyObjs.push({ id: 'broker', x: e.x, y: e.y, spr: this.skin(this.add.image(e.x, e.y, bodyKey(this, 'broker')), (d) => bodyKey(this, 'broker', d)).setDepth(D.PROP).setRotation(0.4) });
      if (!S.flags.hasSurvey) this.storyObjs.push({ id: 'case', x: e.x + 6, y: e.y + 2, spr: this.skin(this.add.image(e.x + 6, e.y + 2, propKey(this, 'case')), (d) => propKey(this, 'case', d)).setDepth(D.PROP + 1) });
    }
    for (const t of W.targets || []) {
      if (S.gone[t.id]) continue;
      const en = this.spawnEnemy('drifters', t.x, t.y, t.a, { mode: 'park', target: true });
      en.id = t.id;
    }
  }

  setupStart() {
    const S = this.S;
    const W = this.world;
    const park = this.tutorial ? W.carStart : siteById(W, 'motel').park;
    const car = courierCar(S, park.x, park.y, UP);
    car.running = false;
    // Note: the first drive out of the lot must not start against a wreck.
    for (const w of this.wrecks.slice()) {
      if (Math.abs(w.e.x - park.x) > 40 || w.e.y > park.y + 30 || w.e.y < park.y - 90) continue;
      S.gone[w.e.id] = true;
      w.spr.destroy();
      this.wrecks = this.wrecks.filter((q) => q !== w);
    }
    S.carId = 'courier';
    S.mode = 'foot';
    S.p = { x: W.start.x, y: W.start.y, a: UP };
    if (this.tutorial) {
      S.wounds = 1;
      S.ammo = 30;
      S.flags.hasSurvey = true;
      S.beat = 'west';
      S.radio.on = false;
      S.radio.station = STATIONS.length;
    }
  }

  // Note: a new band starts on the highway at its east edge, with the car that came across the river.
  setupArrival() {
    const S = this.S;
    const st = this.world.start;
    delete S.arrive;
    const car = this.car();
    if (car) {
      Object.assign(car, { x: st.x, y: st.y, a: UP, vx: 0, vy: 0, av: 0, impact: 0, skid: 0 });
      car.running = S.mode === 'car';
    } else {
      S.mode = 'foot';
    }
    S.p = car && S.mode !== 'car' ? { x: st.x + 10, y: st.y, a: UP } : { x: st.x, y: st.y, a: UP };
    for (const w of this.wrecks.slice()) {
      if (Math.abs(w.e.x - st.x) > 50 || Math.abs(w.e.y - st.y) > 90) continue;
      S.gone[w.e.id] = true;
      w.spr.destroy();
      this.wrecks = this.wrecks.filter((q) => q !== w);
    }
    writeSave(S);
  }

  addWreck(e) {
    const seed = seedFromString(e.id);
    const paint = e.paint || paintFor(e.model, seed % 4);
    e.vx = 0;
    e.vy = 0;
    e.av = 0;
    const spr = this.skin(this.add.image(e.x, e.y, carKey(this, e.model, paint, 1, seed)), (d) => carKey(this, e.model, paint, 1, seed, d)).setDepth(D.WRECK).setRotation(e.a);
    const view = { e, spr, mass: VEHICLE[e.model].stats.mass * 3 };
    this.wrecks.push(view);
    return view;
  }

  addRunner(e) {
    const seed = seedFromString(e.id);
    e.vx = 0;
    e.vy = 0;
    const paint = e.paint || paintFor(e.model, seed % 4);
    const spr = this.skin(this.add.image(e.x, e.y, carKey(this, e.model, paint)), (d) => carKey(this, e.model, paint, 0, 1, d)).setDepth(D.CAR - 1).setRotation(e.a);
    this.runners.push({ e, spr });
  }

  addCrate(e) {
    const spr = this.skin(this.add.image(e.x, e.y, propKey(this, 'crate')), (d) => propKey(this, 'crate', d)).setDepth(D.PROP);
    this.crates.push({ e, spr });
  }

  addCarView(car) {
    const paint = paintFor(car.model, seedFromString(car.id) % 4);
    const spr = this.skin(this.add.image(car.x, car.y, carKey(this, car.model, paint)), (d) => carKey(this, car.model, paint, 0, 1, d)).setDepth(D.CAR).setRotation(car.a);
    this.carViews.set(car.id, { car, spr });
  }

  addPerson(def) {
    const g = def.guard ? makeGuard(def, { look: def.look, armed: def.armed }) : {
      id: def.id, kind: 'npc', role: def.role || 'local', site: def.site, faction: def.faction || 'none', look: def.look,
      x: def.x, y: def.y, a: def.a ?? Math.PI / 2, home: { x: def.x, y: def.y }, state: 'idle', hp: 2, walk: 0,
    };
    Object.assign(g, { encounter: !!def.encounter, invulnerable: !!def.invulnerable, small: !!def.small, owner: this.curEnc, calm: !!def.calm, story: def.story || null });
    if (def.guard && def.encounter) g.range = 75;
    const spr = this.skin(this.add.image(g.x, g.y, personKey(this, g.look, 0, !!def.armed)), (d) => personKey(this, g.look, 0, !!def.armed, d), g.small ? 0.75 : 1).setDepth(D.PERSON);
    const p = { g, spr, armed: !!def.armed };
    this.people.push(p);
    return p;
  }

  // ---------------------------------------------------------------- G API for encounters and tutorial

  spawnEnemy(faction, x, y, a, extra = {}) {
    const en = makeEnemy(`en${this.S.nextId++}`, faction, x, y, a, extra);
    en.owner = this.curEnc;
    en.spr = this.skin(this.add.image(x, y, carKey(this, en.def.model, en.def.paint)), (d) => carKey(this, en.def.model, en.def.paint, 0, 1, d)).setDepth(D.CAR).setRotation(a);
    this.enemies.push(en);
    return en;
  }

  spawnPerson(def) {
    return this.addPerson(def);
  }

  removePerson(p) {
    p.g.state = 'down';
    p.removed = true;
    p.spr.destroy();
    this.people = this.people.filter((q) => q !== p);
  }

  alertPerson(p) {
    alertGuard(p.g, this.S.p.x, this.S.p.y);
  }

  spawnBarrier(x, y, mass = 2) {
    const b = { x, y, r: 9, vx: 0, vy: 0, mass, owner: this.curEnc };
    b.spr = this.skin(this.add.image(x, y, propKey(this, 'barrier')), (d) => propKey(this, 'barrier', d), 1.6, 1).setDepth(D.PROP);
    this.barriers.push(b);
    return b;
  }

  moveBarrier(b, x, y) {
    b.x = x;
    b.y = y;
    b.spr.setPosition(x, y);
  }

  spawnProp(kind, x, y, a) {
    const model = 'grandmarquis03';
    const spr = this.skin(this.add.image(x, y, carKey(this, model, paintFor(model, 2), 1, 77)), (d) => carKey(this, model, paintFor(model, 2), 1, 77, d)).setDepth(D.WRECK).setRotation(a);
    const p = { kind, x, y, a, model, vx: 0, vy: 0, av: 0, spr, owner: this.curEnc, mass: 3 };
    this.props.push(p);
    return p;
  }

  addLight(x, y, kind, r) {
    const l = { x, y, kind, r, owner: this.curEnc };
    if (kind === 'fire') l.spr = this.skin(this.add.image(x, y, propKey(this, 'fire')), (d) => propKey(this, 'fire', d)).setDepth(D.PROP);
    if (kind === 'lamp') l.spr = this.skin(this.add.image(x, y, propKey(this, 'lamp')), (d) => propKey(this, 'lamp', d)).setDepth(D.PROP);
    this.extraLights.push(l);
    return l;
  }

  startVoice(speaker, v, ctx) {
    // Note: 5 s plus 1 s per word of the line and its replies.
    const words = [v.text, ...v.replies.map((r) => r.label)].join(' ').split(/\s+/).filter(Boolean).length;
    this.voice = { ...v, speaker, ctx, t: 0, timeout: 5 + words };
    this.audio?.bark();
  }

  cancelVoice(speaker) {
    if (this.voice && this.voice.speaker === speaker) this.voice = null;
  }

  say(speaker, text, who = '', secs = 3, hostile = false) {
    this.barks.push({ id: `b${this.S.nextId++}`, speaker, text, who, t: secs, hostile });
    this.audio?.bark();
  }

  radioCB(text) {
    const st = STATIONS[this.S.radio.station];
    if (this.S.radio.on && st && st.id === 'cb19' && this.S.mode === 'car') this.hud.radioLine(`CB 19: ${text}`);
  }

  // Note: a broadcast that cuts in on any station, as long as the courier is in the car.
  radioLine(who, text) {
    if (this.S.mode !== 'car') return;
    this.hud.radioLine(`${who}: ${text}`, 9);
    this.audio?.radioVoice(Math.min(6, 1 + text.length / 16));
  }

  // Note: on foot, the Crown Vic only gives the courier away while it is in reach.
  copCar() {
    const car = this.car();
    return !!car && car.model === COURIER_CAR && (this.S.mode === 'car' || dist(car, this.foot) < 250);
  }

  carDisabled() {
    const car = this.car();
    return !car || carStats(VEHICLE[car.model], car.parts).disabled;
  }

  fightStarted(faction, loud = true) {
    if (loud) bumpHeat(this.S, 5);
    this.S.flags[`fought_${faction}`] = true;
  }

  setBeat(b) {
    this.S.beat = b;
  }

  encounterDone(live) {
    for (const list of [this.people.map((p) => p.g), this.enemies, this.barriers, this.props, this.extraLights]) {
      for (const o of list) if (o.owner === live.id) o.expire = true;
    }
  }

  // ---------------------------------------------------------------- frame

  update(time, delta) {
    if (this.idle || this.over) return;
    const dt = Math.min(0.05, delta / 1000);
    this.dt = dt;
    const k = this.input2;
    this.menus(k);
    if (!this.paused && !this.over) {
      this.simulate(dt);
      if (!this.over) this.render(dt);
    }
    k.endFrame();
  }

  menus(k) {
    if (k.hit('Escape')) {
      const st = this.panelState;
      // Note: loot and garage panels close with E only.
      if (st && (st.type === 'loot' || st.type === 'garage')) return;
      if (st) this.closePanel();
      else if (this.mapOpen) this.toggleMap(false);
      else if (this.helpOpen) this.toggleHelp(false);
      else this.setPaused(!this.paused);
    }
    if (this.paused) return;
    if (k.hit('KeyH')) this.toggleHelp(!this.helpOpen);
    if (k.hit('KeyM')) this.toggleMap(!this.mapOpen);
  }

  simulate(real) {
    const S = this.S;
    const k = this.input2;
    // Note: the world stands still while a voice waits for an answer; only the answer timer runs, in real time.
    const talking = !!this.voice;
    const dt = talking ? 0 : real;
    this.dt = dt;
    this.realT += real;
    if (this.ending) {
      this.ending.t -= real;
      if (this.ending.t <= 0) {
        this.showEnding(this.ending.id);
        return;
      }
    }
    const before = S.time;
    this.stepWeather(real);
    const events = stepSurvival(S, dt, { takeWater: (n) => takeWater(n, ...this.waterLists()) });
    for (const ev of events) this.survivalEvent(ev);
    if (this.over) return;
    if (Math.floor(before / HOUR_SECONDS) !== Math.floor(S.time / HOUR_SECONDS)) this.hourTick();
    if (!talking && S.mode === 'car') this.driveInput(k);
    else if (!talking) this.footInput(k, dt);
    this.stepPhysics(dt);
    this.settleEnemies(dt);
    this.hazards.step(dt, this.hazardBodies(), (h, b, what) => this.hazardHit(h, b, what));
    if (!talking) this.weapons(k, dt);
    this.bullets.step(dt, (b) => this.bulletHit(b), (x, y) => cellPropsAtPx(this.world, x, y).opaque);
    this.stepPeople(dt);
    this.director.update(this.playerBody());
    this.stepVoice(k, real);
    if (!talking) this.keys(k);
    this.stepPressure(dt);
    this.stepBeats();
    if (this.tut) this.stepTutorial();
    this.cleanup();
    this.saveT += real;
    if (this.saveT > 30) this.autosave();
    if (isDead(S)) this.die(S.lastWound || 'wounds');
  }

  // ---------------------------------------------------------------- driving

  car() {
    return this.S.cars[this.S.carId] || null;
  }

  playerBody() {
    const S = this.S;
    const car = this.car();
    if (S.mode === 'car' && car) {
      return { x: car.x, y: car.y, vx: car.vx, vy: car.vy, a: car.a, speed: speedOf(car), inCar: true, hidden: false };
    }
    const f = this.foot;
    return { x: f.x, y: f.y, vx: f.vx, vy: f.vy, a: f.a, speed: Math.hypot(f.vx, f.vy), inCar: false, onFoot: true, hidden: false };
  }

  driveInput(k) {
    const car = this.car();
    const throttle = (k.down('KeyW', 'ArrowUp') ? 1 : 0) - (k.down('KeyS', 'ArrowDown') ? 1 : 0);
    this.ctl = {
      throttle,
      steer: (k.down('KeyD', 'ArrowRight') ? 1 : 0) - (k.down('KeyA', 'ArrowLeft') ? 1 : 0),
      handbrake: k.down('Space'),
      brake: false,
      steerMul: this.reloadT > 0 ? 0.45 : 1,
    };
    this.crankT -= this.dt;
    if (!car.running && throttle !== 0 && this.crankT <= 0) this.crank(car);
  }

  crank(car) {
    this.crankT = 1.3;
    const r = tryStart(car, Math.random);
    this.audio?.crank(r.ok);
    if (!r.ok) this.hud.toast(r.why === 'fuel' ? 'Out of gas.' : r.why === 'dead' ? 'Engine\'s dead.' : 'Won\'t catch.');
    return r.ok;
  }

  stepPhysics(dt) {
    const S = this.S;
    const car = this.car();
    const driving = S.mode === 'car' && car;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      this.acc -= STEP;
      n++;
      if (driving) {
        const ox = car.x;
        const oy = car.y;
        stepCar(car, this.ctl, this.env, STEP);
        S.stats.miles += Math.hypot(car.x - ox, car.y - oy) * MILES_PER_PX;
        if (car.impact > 70) this.carCrash(car, car.impact);
      }
      for (const v of this.carViews.values()) {
        if (v.car === car && driving) continue;
        if (Math.abs(v.car.vx) + Math.abs(v.car.vy) > 1) stepCar(v.car, { throttle: 0, steer: 0, brake: true }, this.env, STEP);
      }
      const target = this.playerBody();
      for (const en of this.enemies) {
        if (Math.abs(en.car.y - target.y) > 900) continue;
        stepEnemy(en, this.enemyCtx(target), STEP);
      }
      this.collisions(driving ? car : null, STEP);
    }
    if (n >= 8) this.acc = 0;
  }

  enemyCtx(target) {
    if (!this.ectx) {
      this.ectx = {
        env: this.env,
        solidAt: (x, y) => cellPropsAtPx(this.world, x, y).solidCar,
        fire: (b) => this.bullets.add(b),
        rand: Math.random,
        sound: (kind, x, y) => this.sfx(kind, x, y),
        lob: (en, x, y, dur) => {
          this.hazards.molotov(en.car.x, en.car.y, x, y, dur, { faction: en.faction });
          this.sfx('enemy', en.car.x, en.car.y);
        },
        // Note: strips and caltrops land behind the dropping car, across its heading.
        drop: (kind, en) => {
          const back = VEHICLE[en.car.model].len / 2 + 10;
          const x = en.car.x - Math.cos(en.car.a) * back;
          const y = en.car.y - Math.sin(en.car.a) * back;
          if (kind === 'spikes') this.hazards.spikes(x, y, en.car.a, 44, { faction: en.faction });
          else this.hazards.caltrops(x, y, 7, Math.random, 26, { faction: en.faction });
        },
      };
    }
    this.ectx.target = target;
    return this.ectx;
  }

  collisions(car, dt) {
    const S = this.S;
    const near = (a, b, r = 60) => Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
    const movers = [];
    if (car) movers.push({ c: car, player: true });
    for (const en of this.enemies) movers.push({ c: en.car, en });
    for (const m of movers) {
      for (const w of this.wrecks) {
        if (!near(m.c, w.e)) continue;
        const hit = collideCars(m.c, w.e, VEHICLE[m.c.model].stats.mass, w.mass);
        if (hit > 0) w.moved = true;
        if (m.player && hit > 70) this.carCrash(m.c, hit * 0.8);
      }
      for (const p of this.props) if (near(m.c, p)) collideCars(m.c, p, VEHICLE[m.c.model].stats.mass, p.mass);
      for (const r of this.runners) if (near(m.c, r.e)) collideCars(m.c, r.e, VEHICLE[m.c.model].stats.mass, 4);
      for (const v of this.carViews.values()) {
        if (v.car === m.c || !near(m.c, v.car)) continue;
        collideCars(m.c, v.car);
      }
      for (const b of this.barriers) {
        if (!near(m.c, b, 40)) continue;
        const hit = collideCircle(m.c, b, VEHICLE[m.c.model].stats.mass, b.mass);
        if (m.player && hit > 90) this.carCrash(m.c, hit * 0.6);
      }
      for (const p of this.people) {
        const g = p.g;
        if (g.state === 'down' || !near(m.c, g, 30)) continue;
        for (const cc of carCircles(m.c)) {
          if (Math.hypot(cc.x - g.x, cc.y - g.y) > cc.r + FOOT_R) continue;
          if (speedOf(m.c) > 55 && m.player && !g.invulnerable) this.personDown(p, 'car');
          else {
            const d = Math.hypot(g.x - cc.x, g.y - cc.y) || 1;
            g.x = cc.x + ((g.x - cc.x) / d) * (cc.r + FOOT_R);
            g.y = cc.y + ((g.y - cc.y) / d) * (cc.r + FOOT_R);
          }
        }
      }
    }
    if (car) {
      for (const en of this.enemies) {
        if (en.gone || !near(car, en.car)) continue;
        const hit = collideCars(car, en.car);
        if (hit > 50) {
          this.carCrash(car, hit * (isBike(en.def.model) ? 0.3 : 0.7));
          if (ramEnemy(en, hit, Math.random)) this.enemyDown(en);
          else if (!en.hostile && !en.target && en.mode !== 'park') en.hostile = true;
        }
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i].car;
        const b = this.enemies[j].car;
        if (near(a, b)) collideCars(a, b);
      }
    }
    // Note: shoved wrecks and props slide to a stop.
    for (const list of [this.wrecks.map((w) => w.e), this.props, this.runners.map((r) => r.e)]) {
      for (const e of list) {
        if (!e.vx && !e.vy) continue;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.a += (e.av || 0) * dt;
        collideTiles(e, this.env);
        const k = Math.exp(-5 * dt);
        e.vx *= k;
        e.vy *= k;
        e.av = (e.av || 0) * k;
        if (Math.abs(e.vx) + Math.abs(e.vy) < 1.5) {
          e.vx = 0;
          e.vy = 0;
          e.av = 0;
          this.persist(e);
        }
      }
    }
    for (const b of this.barriers) {
      if (!b.vx && !b.vy) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const k = Math.exp(-4 * dt);
      b.vx *= k;
      b.vy *= k;
      if (Math.abs(b.vx) + Math.abs(b.vy) < 1) b.vx = b.vy = 0;
    }
  }

  carCrash(car, impact) {
    if (this.crashCd > this.realT) return;
    this.crashCd = this.realT + 0.25;
    this.audio?.crash(clamp(impact / 260, 0, 1));
    this.shake(120, Math.min(0.012, impact / 25000));
    const r = applyImpact(car, impact, Math.random);
    if (r && r.wound) {
      this.hud.toast('Hit.');
      addWound(this.S, 1, 'crash');
    }
  }

  // ---------------------------------------------------------------- on foot

  footInput(k, dt) {
    const f = this.foot;
    const run = k.down('ShiftLeft', 'ShiftRight');
    const ctl = {
      mx: (k.down('KeyD', 'ArrowRight') ? 1 : 0) - (k.down('KeyA', 'ArrowLeft') ? 1 : 0),
      my: (k.down('KeyS', 'ArrowDown') ? 1 : 0) - (k.down('KeyW', 'ArrowUp') ? 1 : 0),
      run,
    };
    const before = f.walk;
    const surf = stepFoot(f, ctl, this.world, dt);
    this.collideFoot(f);
    const m = this.mouseWorld();
    f.a = Math.atan2(m.y - f.y, m.x - f.x);
    const stride = run ? 7 : 10;
    if (Math.floor(f.walk / stride) !== Math.floor(before / stride)) {
      this.audio?.footstep(surf === 'water' ? 'water' : surf === 'soft' ? 'soft' : 'hard');
      if (run) this.noise(f.x, f.y, 40);
    }
  }

  // Note: wrecks, cars and barriers block walking.
  collideFoot(f) {
    const bodies = [];
    for (const w of this.wrecks) if (Math.abs(w.e.x - f.x) < 30 && Math.abs(w.e.y - f.y) < 30) bodies.push(...carCircles(w.e));
    for (const v of this.carViews.values()) if (Math.abs(v.car.x - f.x) < 30 && Math.abs(v.car.y - f.y) < 30) bodies.push(...carCircles(v.car));
    for (const r of this.runners) if (Math.abs(r.e.x - f.x) < 30 && Math.abs(r.e.y - f.y) < 30) bodies.push(...carCircles(r.e));
    for (const en of this.enemies) if (Math.abs(en.car.x - f.x) < 30 && Math.abs(en.car.y - f.y) < 30) bodies.push(...carCircles(en.car));
    for (const b of this.barriers) bodies.push(b);
    for (const b of bodies) {
      const dx = f.x - b.x;
      const dy = f.y - b.y;
      const d = Math.hypot(dx, dy);
      const min = b.r + FOOT_R;
      if (d < min && d > 0.001) {
        f.x = b.x + (dx / d) * min;
        f.y = b.y + (dy / d) * min;
      }
    }
    pushOut(this.world, f, FOOT_R);
  }

  mouseWorld() {
    const cam = this.cameras.main;
    const z = cam.zoom;
    return { x: cam.scrollX + VIEW_W / 2 + (this.input2.mouse.x - VIEW_W / 2) / z, y: cam.scrollY + VIEW_H / 2 + (this.input2.mouse.y - VIEW_H / 2) / z };
  }

  noise(x, y, radius) {
    for (const p of this.people) if (p.g.kind === 'guard' && !p.g.encounter) hearNoise(p.g, x, y, radius);
  }

  // ---------------------------------------------------------------- weapons

  weapons(k, dt) {
    const S = this.S;
    const w = WEAPONS[S.weapon];
    this.fireT -= dt;
    this.meleeT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(w.mag - S.mag, S.ammo);
        S.mag += take;
        S.ammo -= take;
      }
    }
    if (this.panelState || this.voice && k.digit()) return;
    if (S.mode === 'foot') {
      if (k.hit('KeyG')) {
        this.drawn = !this.drawn;
        this.hud.toast(this.drawn ? `${w.name} out.` : 'Holstered.');
      }
      if (!this.drawn) {
        if (k.mouse.clicked && this.meleeT <= 0) this.melee();
        return;
      }
    }
    if (k.hit('KeyR')) this.startReload();
    if (k.hit('KeyX') && S.weapons.length > 1) {
      const i = (S.weapons.indexOf(S.weapon) + 1) % S.weapons.length;
      S.ammo += S.mag;
      S.mag = 0;
      S.weapon = S.weapons[i];
      this.reloadT = 0;
      this.hud.toast(WEAPONS[S.weapon].name);
      this.startReload();
    }
    if (!k.mouse.down || this.fireT > 0 || this.reloadT > 0) return;
    const P = this.playerBody();
    const m = this.mouseWorld();
    const aim = Math.atan2(m.y - P.y, m.x - P.x);
    if (P.inCar && !inArc(P.a, aim)) return;
    if (S.mag <= 0) {
      if (S.ammo > 0) this.startReload();
      else if (k.mouse.clicked) {
        this.audio?.ui('deny');
        this.hud.toast('Out of ammo.');
      }
      return;
    }
    this.fireT = w.rate;
    S.mag -= 1;
    S.stats.shots += 1;
    const shake = 1 + S.wounds * 0.6;
    for (let i = 0; i < w.pellets; i++) {
      const a = aim + (Math.random() - 0.5) * 2 * w.spread * shake;
      this.bullets.add({
        x: P.x + Math.cos(aim) * (P.inCar ? 8 : 3), y: P.y + Math.sin(aim) * (P.inCar ? 8 : 3),
        vx: Math.cos(a) * w.speed + P.vx, vy: Math.sin(a) * w.speed + P.vy,
        from: 'player', dmg: w.dmg, life: 0.7,
      });
    }
    this.flashes.push({ x: P.x + Math.cos(aim) * (P.inCar ? 10 : 4), y: P.y + Math.sin(aim) * (P.inCar ? 10 : 4), t: 0.06 });
    this.audio?.shot(w.sound, 0, 0);
    bumpHeat(S, 0.4);
    this.noise(P.x, P.y, 320);
    if (S.mag === 0 && S.ammo > 0) this.startReload();
  }

  startReload() {
    const S = this.S;
    const w = WEAPONS[S.weapon];
    if (this.reloadT > 0 || S.mag >= w.mag || S.ammo <= 0) return;
    this.reloadT = w.reload;
    this.audio?.reload();
  }

  melee() {
    this.meleeT = 0.55;
    const f = this.foot;
    let hit = null;
    for (const p of this.people) {
      const g = p.g;
      if (g.state === 'down') continue;
      const d = Math.hypot(g.x - f.x, g.y - f.y);
      if (d > 9 || Math.abs(angleDiff(f.a, Math.atan2(g.y - f.y, g.x - f.x))) > 1) continue;
      hit = p;
      break;
    }
    this.audio?.melee(!!hit);
    if (!hit) return;
    const g = hit.g;
    if (g.invulnerable) {
      g.shot = true;
      return;
    }
    if (g.kind === 'guard' && g.state !== 'alert') {
      this.personDown(hit, 'knockout');
    } else {
      g.hp -= 1;
      g.x += Math.cos(f.a) * 3;
      g.y += Math.sin(f.a) * 3;
      if (g.kind === 'npc') {
        this.say(g, 'Hey!', '', 1.5, true);
        adjustStanding(this.S, g.faction, -5);
      }
      if (g.hp <= 0) this.personDown(hit, 'beaten');
      else if (g.kind === 'guard') alertGuard(g, f.x, f.y);
    }
    this.noise(f.x, f.y, 45);
  }

  // Note: knocked out, beaten or killed; world people stay down for the rest of the run.
  personDown(p, how) {
    const g = p.g;
    if (g.state === 'down') return;
    g.state = 'down';
    g.how = how;
    this.skin(p.spr, (d) => bodyKey(this, g.look, d), g.small ? 0.75 : 1).setRotation(g.a);
    p.spr.setDepth(D.PROP);
    const S = this.S;
    if (!g.encounter && !g.owner) S.gone[g.id] = how;
    if (how !== 'knockout') {
      S.stats.kills += 1;
      bumpHeat(S, 6);
      adjustStanding(S, g.faction, -25);
      if (g.faction === 'brigade') S.flags.brigadeBlood = true;
    }
    g.ammoLeft = g.kind === 'guard' ? 3 + Math.floor(Math.random() * 5) : 0;
  }

  // ---------------------------------------------------------------- bullets

  bulletHit(b) {
    const S = this.S;
    if (b.from === 'player') {
      for (const en of this.enemies) {
        if (Math.abs(en.car.x - b.x) > 24 || Math.abs(en.car.y - b.y) > 24) continue;
        if (!carCircles(en.car).some((c) => Math.hypot(c.x - b.x, c.y - b.y) < c.r + 1)) continue;
        this.sfx('metal', b.x, b.y, true);
        if (en.dead) return true;
        if (!en.hostile && !en.target && en.mode !== 'leave') {
          en.hostile = true;
          if (en.mode === 'park') en.mode = 'chase';
        }
        if (hurtEnemy(en, b.dmg, Math.random)) this.enemyDown(en);
        return true;
      }
      for (const p of this.people) {
        const g = p.g;
        if (g.state === 'down' || Math.hypot(g.x - b.x, g.y - b.y) > 3) continue;
        if (g.invulnerable) {
          g.shot = true;
          return true;
        }
        this.sfx('flesh', b.x, b.y, true);
        g.hp -= 2;
        if (g.kind === 'guard') alertGuard(g, S.p.x, S.p.y);
        if (g.hp <= 0) this.personDown(p, 'shot');
        return true;
      }
    } else {
      const P = this.playerBody();
      if (P.inCar) {
        const car = this.car();
        if (Math.abs(car.x - b.x) < 24 && Math.abs(car.y - b.y) < 24 && carCircles(car).some((c) => Math.hypot(c.x - b.x, c.y - b.y) < c.r + b.r)) {
          this.playerShot(b, car);
          return true;
        }
      } else if (Math.hypot(P.x - b.x, P.y - b.y) < 2.5 + b.r) {
        this.sfx('flesh', b.x, b.y, true);
        this.hurt('shot', 'Hit.');
        return true;
      }
      for (const v of this.carViews.values()) {
        if (v.car === this.car() && P.inCar) continue;
        if (Math.abs(v.car.x - b.x) < 20 && Math.abs(v.car.y - b.y) < 20 && carCircles(v.car).some((c) => Math.hypot(c.x - b.x, c.y - b.y) < c.r)) return true;
      }
    }
    for (const w of this.wrecks) {
      if (Math.abs(w.e.x - b.x) > 20 || Math.abs(w.e.y - b.y) > 20) continue;
      if (carCircles(w.e).some((c) => Math.hypot(c.x - b.x, c.y - b.y) < c.r)) {
        this.sfx('metal', b.x, b.y, true);
        return true;
      }
    }
    return false;
  }

  playerShot(b, car) {
    if (b.tire && car.parts.tires && Math.random() < 0.4) {
      car.parts.tires.cond = Math.max(0, car.parts.tires.cond - b.dmg * 0.5);
      this.sfx('metal', b.x, b.y, true);
      if (car.parts.tires.cond <= 0) this.hud.toast('Tires shredded.');
      return;
    }
    const out = hitCar(car.parts, b.dmg, Math.random);
    this.sfx(out.armor ? 'metal' : 'glass', b.x, b.y, true);
    if (out.wound) this.hurt('shot', 'Hit.');
    if (carStats(VEHICLE[car.model], car.parts).disabled && !this.disabledToast) {
      this.disabledToast = true;
      this.hud.toast('Engine\'s dead.', 3);
      car.running = false;
    }
  }

  hurt(cause, text) {
    this.shake(150, 0.01);
    this.hud.toast(text);
    addWound(this.S, 1, cause);
  }

  // ---------------------------------------------------------------- hazards

  hazardBodies() {
    const S = this.S;
    const car = this.car();
    const out = [];
    if (S.mode === 'car' && car) out.push({ key: 'player', faction: 'player', x: car.x, y: car.y, r: VEHICLE[car.model].wid / 2 + 2 });
    else out.push({ key: 'foot', faction: 'player', x: this.foot.x, y: this.foot.y, r: FOOT_R });
    for (const en of this.enemies) if (!en.dead) out.push({ key: en.id, faction: en.faction, x: en.car.x, y: en.car.y, r: VEHICLE[en.car.model].wid / 2 + 2, en });
    return out;
  }

  hazardHit(h, b, what) {
    if (what === 'land') {
      this.sfx('glass', h.x, h.y, true);
      this.flashes.push({ x: h.x, y: h.y, t: 0.15 });
      this.noise(h.x, h.y, 200);
      return;
    }
    if (b.en) {
      if (b.en.gone || b.en.dead) return;
      const dmg = what === 'spike' ? 18 : what === 'caltrop' ? 3 : 5;
      if (hurtEnemy(b.en, dmg, Math.random)) this.enemyDown(b.en);
      return;
    }
    if (b.key === 'foot') {
      // Note: one wound per fire; standing in it longer only scares.
      if ((what === 'burn' || what === 'splash') && !h.burnedFoot) {
        h.burnedFoot = true;
        this.hurt('burned', 'Burned.');
      }
      return;
    }
    const car = this.car();
    if (!car) return;
    const tires = car.parts.tires;
    if (what === 'spike') {
      if (tires) tires.cond = Math.max(0, tires.cond - 70);
      this.sfx('metal', b.x, b.y, true);
      this.shake(120, 0.006);
      this.hud.toast('Spike strip.', 3);
    } else if (what === 'caltrop') {
      if (tires) tires.cond = Math.max(0, tires.cond - 12);
      this.sfx('metal', b.x, b.y, true);
      if ((this.caltropT || 0) < this.realT) this.hud.toast('Caltrops.');
      this.caltropT = this.realT + 3;
    } else {
      const out = hitCar(car.parts, 6, Math.random);
      if (!h.toasted) this.hud.toast('Fire.');
      h.toasted = true;
      if (out.wound) this.hurt('burned', 'Burned.');
    }
    if (carStats(VEHICLE[car.model], car.parts).disabled && !this.disabledToast) {
      this.disabledToast = true;
      this.hud.toast('Engine\'s dead.', 3);
      car.running = false;
    }
  }

  enemyDown(en) {
    const S = this.S;
    S.stats.kills += en.def.crew - Math.max(0, en.crew);
    bumpHeat(S, 8);
    adjustStanding(S, en.faction === 'hunter' ? 'brigade' : en.faction, -10);
    en.downed = true;
    en.settleT = 0;
    if (en.target) S.gone[en.id] = true;
  }

  // Note: a downed car stays a car until it stops rolling, or until it falls out of sight.
  settleEnemies(dt) {
    const P = this.playerBody();
    for (const en of this.enemies.slice()) {
      if (!en.downed || en.gone) continue;
      en.settleT += dt;
      const far = Math.abs(en.car.x - P.x) > 650 || Math.abs(en.car.y - P.y) > 650;
      if (speedOf(en.car) < 6 || en.settleT > 10 || far) this.leaveEnemy(en);
    }
  }

  leaveEnemy(en) {
    const S = this.S;
    const runs = drivable(en);
    const e = (runs ? enemyRunner : enemyWreck)(en, newId(S, 'dyn'), Math.random);
    if (!this.tutorial || !en.target) S.dyn.push(e);
    if (runs) this.addRunner(e);
    else this.addWreck(e);
    en.gone = true;
    en.spr.destroy();
    this.enemies = this.enemies.filter((q) => q !== en);
  }

  sfx(kind, x, y, impact = false) {
    const P = this.playerBody();
    const dx = x - P.x;
    const d = clamp(Math.hypot(dx, y - P.y) / 500, 0, 1);
    const pan = clamp((dx * this.cameras.main.zoom) / 240, -1, 1);
    if (impact) this.audio?.impact(kind, pan, d);
    else this.audio?.shot(kind, pan, d);
  }

  // ---------------------------------------------------------------- people

  stepPeople(dt) {
    const S = this.S;
    const P = this.playerBody();
    const night = this.tutorial ? 0 : darkness(S.time);
    const lit = this.playerLit(P);
    const vis = (night > 0.45 && !lit ? 0.45 : 1) * (1 - 0.35 * this.rain);
    const site = this.world.kind === 'band' ? this.siteOf(P) : null;
    const gctx = this.gctx || (this.gctx = {
      world: this.world,
      rand: Math.random,
      say: (g, kind) => this.say(g, kind === 'alert' ? pick(ALERTS) : pick(SPOT), '', 2, kind === 'alert'),
      fire: (g, a) => {
        this.bullets.add({ x: g.x + Math.cos(a) * 3, y: g.y + Math.sin(a) * 3, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, from: 'guard', dmg: 9, col: C.RED, r: 2, life: 1.1 });
        this.flashes.push({ x: g.x, y: g.y, t: 0.05 });
        this.sfx('enemy', g.x, g.y);
      },
      melee: () => {
        this.audio?.melee(true);
        this.hurt('beaten', 'Hit.');
      },
      alertNear: (g) => {
        for (const p of this.people) {
          if (p.g !== g && p.g.kind === 'guard' && p.g.site === g.site && dist(p.g, g) < 110) alertGuard(p.g, S.p.x, S.p.y);
        }
        if (g.site && !S.flags[`trespass_${g.site}`]) {
          S.flags[`trespass_${g.site}`] = true;
          adjustStanding(S, g.faction, -5);
          bumpHeat(S, 3);
        }
      },
    });
    gctx.player = { x: P.x, y: P.y, onFoot: !P.inCar, moving: !P.inCar && !!this.foot?.moving, vis, armed: !P.inCar && this.drawn };
    for (const p of this.people) {
      const g = p.g;
      if (g.state === 'down' || Math.abs(g.y - P.y) > 520 || Math.abs(g.x - P.x) > 520) continue;
      if (g.kind === 'guard') {
        // Note: calm guards only mind a drawn gun or someone in the back rooms.
        const calm = g.calm && !(g.faction === 'brigade' && S.flags.brigadeWar);
        const mind = !calm || this.drawn || this.onCarpet(P);
        gctx.watch = g.encounter ? g.state === 'alert' : g.state === 'alert' || (site && site.id === g.site && mind);
        stepGuard(g, gctx, dt);
        if (g.state === 'alert' && Math.hypot(P.x - g.x, P.y - g.y) > 420 && P.inCar) {
          g.state = 'search';
          g.sus = 0.5;
        }
      } else if (dist(g, P) < 35) {
        turnToward(g, Math.atan2(P.y - g.y, P.x - g.x), 3, dt);
      }
    }
  }

  onCarpet(P) {
    return !P.inCar && cellAtPx(this.world, P.x, P.y) === T.CARPET;
  }

  siteOf(P) {
    const tx = P.x / TILE;
    const ty = P.y / TILE;
    for (const s of this.world.sites) if (tx >= s.x - 1 && tx < s.x + s.w + 1 && ty >= s.y - 1 && ty < s.y + s.h + 1) return s;
    return null;
  }

  playerLit(P) {
    for (const l of this.allLights()) if (Math.hypot(l.x - P.x, l.y - P.y) < l.r * 0.8) return true;
    const car = this.car();
    return P.inCar && car && car.lights;
  }

  allLights() {
    return this.world.lights.concat(this.extraLights);
  }

  // ---------------------------------------------------------------- voices and barks

  stepVoice(k, dt) {
    const v = this.voice;
    for (const b of this.barks) b.t -= dt;
    this.barks = this.barks.filter((b) => b.t > 0);
    if (!v) return;
    v.t += dt;
    const d = k.digit();
    if (d >= 1 && d <= v.replies.length) {
      const r = v.replies[d - 1];
      if (!this.canAfford(r.need)) {
        this.audio?.ui('deny');
        this.hud.toast('Not enough.');
      } else {
        this.audio?.ui('confirm');
        this.resolveVoice(r.fx);
      }
      return;
    }
    if (v.t >= v.timeout) this.resolveVoice(v.fxTimeout);
  }

  canAfford(need) {
    if (!need) return true;
    if (need.water && waterUnits(...this.waterLists()) < need.water) return false;
    if (need.ammo && ammoTotal(this.S) < need.ammo) return false;
    return true;
  }

  resolveVoice(fx) {
    const v = this.voice;
    this.voice = null;
    if (this.tutorial) this.S.flags.tutTalked = true;
    this.voiceFx(fx || {}, v.ctx || {}, v.speaker, v.who, v.hostile);
    if (v.ctx && v.ctx.onDone) v.ctx.onDone();
  }

  voiceFx(fx, ctx, speaker, who, hostile) {
    const S = this.S;
    if (fx.water) takeWater(-fx.water, ...this.waterLists());
    if (fx.ammo) spendAmmo(S, -fx.ammo);
    if (fx.flag) S.flags[fx.flag] = true;
    if (fx.heat) bumpHeat(S, fx.heat);
    if (fx.standing) for (const [f, n] of Object.entries(fx.standing)) adjustStanding(S, f, n);
    if (fx.jug) {
      const got = this.giveWater(fx.jug);
      this.hud.toast(got ? `+${got} water` : 'No room.');
    }
    if (fx.hunter) S.hunter = fx.hunter;
    if (fx.give === 'half') this.takeHalf(false);
    if (fx.test) {
      const ok = this.voiceTest(fx);
      if (ok && fx.test === 'mislead') S.hunter = 'misled';
      this.say(speaker, ok ? fx.okSay ?? (fx.test === 'lie' ? fx.say : 'Go on.') : fx.say, who, 3, hostile);
      if (ok) ctx.onPass?.();
      else ctx.onFight?.();
      return;
    }
    if (fx.say) this.say(speaker, fx.say, who, 3, hostile && !!fx.fight);
    if (fx.pass) ctx.onPass?.();
    if (fx.fight) ctx.onFight?.();
    if (fx.end) this.finish(fx.end);
  }

  voiceTest(fx) {
    const S = this.S;
    if (fx.test === 'lie') return !this.copCar();
    if (fx.test === 'drifters') return standingOf(S, 'drifters') >= 10;
    if (fx.test === 'coop') return standingOf(S, 'coop') >= 10 || !!(S.flags.gaveTown || S.flags.gaveFamily || S.flags.coopPlea);
    // Note: the decoy story only holds when the car does not match the description on the radio.
    if (fx.test === 'mislead') return !this.copCar() && S.heat < (fx.hard ? 45 : 65);
    return false;
  }

  // Note: Survey 7-D is the Residents' half; taking it unasked costs their trust for good.
  takeHalf(stolen) {
    const S = this.S;
    S.flags.surveyFull = true;
    if (stolen) {
      S.flags.stoleHalf = true;
      adjustStanding(S, 'residents', -40);
      bumpHeat(S, 4);
      // Note: the elder sees a theft in the house unless someone put him down first.
      const elder = this.people.find((p) => p.g.role === 'elder' && p.g.state !== 'down');
      if (elder && dist(elder.g, this.foot) < 100) {
        this.say(elder.g, 'Shut the gate! Shut it!', 'Resident', 3, true);
        this.siteAlarm(elder.g);
      }
    }
    const o = this.storyObjs.find((q) => q.id === 'half');
    if (o) {
      o.spr.destroy();
      this.storyObjs = this.storyObjs.filter((q) => q !== o);
    }
    this.hud.toast('Survey 7-D.', 4);
    this.audio?.ui('loot');
    this.autosave(true);
  }

  // Note: water goes into the car when it is in reach, else into the hands.
  giveWater(units) {
    const car = this.carInReach();
    if (car) {
      const got = addWater(units, car.storage, capacityOf(car), () => newId(this.S));
      if (got) return got;
    }
    return addWater(units, this.S.hands, handsCap(), () => newId(this.S));
  }

  carInReach(range = 32) {
    const car = this.car();
    if (!car) return null;
    if (this.S.mode === 'car') return car;
    return dist(car, this.foot) < range ? car : null;
  }

  waterLists() {
    const car = this.carInReach(60);
    return car ? [car.storage, this.S.hands] : [this.S.hands];
  }

  // ---------------------------------------------------------------- keys and interactions

  keys(k) {
    const S = this.S;
    if (this.panelState) {
      this.panelKeys(k);
      return;
    }
    if (k.hit('Tab')) this.openStorage();
    if (k.hit('KeyZ')) this.drinkWater();
    if (k.hit('KeyF') && S.mode === 'car') {
      const car = this.car();
      car.lights = !car.lights;
      this.audio?.ui('click');
    }
    if (k.hit('KeyQ')) this.tuneRadio();
    this.target = this.findTarget();
    if (k.hit('KeyE') && this.target) this.act(this.target);
  }

  drinkWater() {
    const r = drink(this.S, (n) => takeWater(n, ...this.waterLists()));
    const msg = { full: 'Not thirsty.', empty: 'No water.', thirst: '-1 water.', heal: '-1 water. Wound closed.' }[r];
    this.hud.toast(msg);
    this.audio?.ui(r === 'empty' ? 'deny' : 'confirm');
  }

  tuneRadio() {
    const R = this.S.radio;
    R.station = (R.station + 1) % (STATIONS.length + 1);
    R.on = R.station < STATIONS.length;
    this.radioT = 1.5;
    this.audio?.ui('click');
    if (R.on && this.S.mode !== 'car') this.hud.toast('Radio\'s in the car.');
  }

  findTarget() {
    const S = this.S;
    if (S.mode === 'car') {
      const car = this.car();
      return speedOf(car) < 30 ? { kind: 'exit', label: 'get out' } : null;
    }
    const f = this.foot;
    let best = null;
    const consider = (d, max, t) => {
      if (d <= max && (!best || d < best.d)) best = { ...t, d };
    };
    // Note: reach is measured from the body's surface, so long and short cars take the same step.
    const surf = (c) => Math.min(...carCircles(c).map((cc) => dist(f, cc) - cc.r));
    for (const v of this.carViews.values()) consider(surf(v.car), 6, { kind: 'enter', car: v.car, label: `get in the ${VEHICLE[v.car.model].short}` });
    for (const r of this.runners) consider(surf(r.e), 6, { kind: 'take', r, label: `${VEHICLE[r.e.model].short}, keys in` });
    for (const o of this.storyObjs) {
      if (o.id === 'case') consider(dist(f, o), 8, { kind: 'case', o, label: 'case' });
      if (o.id === 'half') consider(dist(f, o), 8, { kind: 'half', o, label: 'Survey 7-D' });
      if (o.id === 'transmitter') consider(dist(f, o), 10, { kind: 'transmitter', o, label: 'transmitter' });
    }
    for (const c of this.crates) consider(dist(f, c.e), 8, { kind: 'loot', e: c.e, label: 'crate' });
    for (const w of this.wrecks) {
      consider(surf(w.e), 6, { kind: 'loot', e: w.e, label: `search ${VEHICLE[w.e.model].short}` });
    }
    for (const p of this.people) {
      const g = p.g;
      if (g.state === 'down') {
        if (g.ammoLeft > 0) consider(dist(f, g), 7, { kind: 'frisk', p, label: 'search body' });
        continue;
      }
      if (g.kind === 'npc' || g.encounter) consider(dist(f, g), 12, { kind: 'talk', p, label: g.role === 'mechanic' ? 'mechanic' : 'talk' });
    }
    return best;
  }

  act(t) {
    const S = this.S;
    switch (t.kind) {
      case 'exit':
        this.exitCar();
        break;
      case 'enter':
        this.enterCar(t.car);
        break;
      case 'take':
        this.takeRunner(t.r);
        break;
      case 'case': {
        S.flags.hasSurvey = true;
        S.beat = 'car';
        t.o.spr.destroy();
        this.storyObjs = this.storyObjs.filter((o) => o !== t.o);
        bumpHeat(S, 6);
        this.hud.toast('Survey 7-C.', 4);
        this.audio?.ui('loot');
        this.autosave(true);
        break;
      }
      case 'half':
        this.takeHalf(true);
        break;
      case 'transmitter':
        this.startVoice(t.o, transmitterVoice(), {});
        break;
      case 'loot':
        this.openLoot(t.e);
        break;
      case 'frisk': {
        const n = t.p.g.ammoLeft;
        S.ammo += n;
        t.p.g.ammoLeft = 0;
        this.hud.toast(`+${n} rounds`);
        this.audio?.ui('loot');
        break;
      }
      case 'talk':
        this.talk(t.p);
        break;
      default:
        break;
    }
  }

  exitCar() {
    const S = this.S;
    const car = this.car();
    const v = VEHICLE[car.model];
    const side = car.a - Math.PI / 2;
    this.foot.x = car.x + Math.cos(side) * (v.wid / 2 + 3);
    this.foot.y = car.y + Math.sin(side) * (v.wid / 2 + 3);
    this.foot.vx = 0;
    this.foot.vy = 0;
    pushOut(this.world, this.foot, FOOT_R);
    car.running = false;
    car.vx *= 0.3;
    car.vy *= 0.3;
    S.mode = 'foot';
    this.audio?.setEngine({ on: false });
    this.audio?.ui('click');
  }

  enterCar(car) {
    const S = this.S;
    if (VEHICLE[car.model].enemyOnly) return;
    S.carId = car.id;
    S.mode = 'car';
    this.drawn = false;
    this.disabledToast = false;
    this.closePanel();
    if (S.beat === 'car') S.beat = 'west';
    if (!carStats(VEHICLE[car.model], car.parts).disabled && car.fuel > 0) this.crank(car);
    this.autosave(true);
  }

  // Note: a running car with keys in becomes the courier's; it doubles as a disguise.
  takeRunner(r) {
    const S = this.S;
    const e = r.e;
    const conds = {};
    for (const slot of SLOTS) conds[slot] = e.parts[slot] ?? (slot === 'armor' ? null : 35);
    const car = makeCar(e.id, e.model, e.x, e.y, e.a, installedParts(e.model, conds, e.id), e.fuel);
    S.cars[car.id] = car;
    S.gone[e.id] = true;
    S.dyn = S.dyn.filter((q) => q !== e);
    // Note: whatever a downed crew carried rides along in the trunk.
    if (e.water > 0) addWater(e.water, car.storage, capacityOf(car), () => newId(S, 'jug'));
    if (e.ammo > 0) S.ammo += e.ammo;
    r.spr.destroy();
    this.runners = this.runners.filter((q) => q !== r);
    this.addCarView(car);
    this.hud.toast(`${VEHICLE[e.model].short}.`, 3.5);
    this.enterCar(car);
  }

  talk(p) {
    const S = this.S;
    const g = p.g;
    if (g.role === 'mechanic') {
      const site = this.world.sites.find((s) => s.id === g.site);
      if (refuses(S, site.faction)) {
        this.say(g, 'Can\'t help you.', 'Mechanic', 3, true);
        return;
      }
      // Note: once the tracker is working, each garage mentions him the first time you come in.
      const asked = `asked:${site.id}`;
      const hunting = S.flags.hunterHired && S.hunter === 'hunting' && hunterStage(S.heat) !== 'none';
      const remark = !this.tutorial && hunting && !S.flags[asked] ? mechanicHunterLine(this.copCar()) : '';
      if (remark) S.flags[asked] = true;
      this.openGarage(site, g, remark);
      return;
    }
    if (g.role === 'clerk' && !S.flags.clerkTalked) {
      S.flags.clerkTalked = true;
      this.startVoice(g, clerkVoice(), {});
      return;
    }
    if (g.role === 'preacher' && !S.flags.preacherTalked) {
      S.flags.preacherTalked = true;
      this.startVoice(g, preacherVoice(S), {});
      return;
    }
    if (g.role === 'elder' || g.role === 'doc' || g.role === 'buyer') {
      const v = this.storyVoice(g);
      if (v) {
        this.startVoice(g, v, { onFight: () => this.siteAlarm(g) });
        return;
      }
    }
    if (g.encounter) return;
    const stage = hunterStage(S.heat);
    let lines = AMBIENT[g.faction] || AMBIENT.none;
    if (S.flags.hunterHired && S.hunter === 'hunting' && stage !== 'none') lines = lines.concat(['Fella in a black Tahoe was asking after a cop car.']);
    if (standingOf(S, g.faction) < -20) lines = ['Get away from me.', 'Go on, get.'];
    this.say(g, pick(lines), g.role === 'local' ? '' : g.role, 3);
  }

  // Note: town elders talk once per band; the Residents, Doc and the buyers can be asked again.
  storyVoice(g) {
    const S = this.S;
    if (g.role === 'doc') return docVoice(S);
    if (g.role === 'buyer') return buyerVoice(S, g.faction, this.hunter);
    if (g.story === 'residents') {
      if (S.flags.surveyFull) return null;
      S.flags.residentsMet = true;
      return residentsVoice(S);
    }
    const once = `talked:${g.id}`;
    if (S.flags[once]) return null;
    S.flags[once] = true;
    return g.story === 'seminole' ? seminoleVoice() : woodvilleVoice();
  }

  siteAlarm(g) {
    for (const p of this.people) {
      const q = p.g;
      if (q.kind !== 'guard' || q.site !== g.site || q.faction !== g.faction || q.state === 'down') continue;
      q.calm = false;
      alertGuard(q, this.S.p.x, this.S.p.y);
    }
  }

  // ---------------------------------------------------------------- panels

  closePanel() {
    this.panelState = null;
    this.hud.closePanel();
  }

  panelKeys(k) {
    const st = this.panelState;
    const f = this.foot;
    if (k.hit('Tab') && st.type === 'storage') {
      this.closePanel();
      return;
    }
    // Note: panels opened with E also close with E.
    if (k.hit('KeyE') && (st.type === 'loot' || st.type === 'garage')) {
      this.closePanel();
      return;
    }
    if (st.anchor && this.S.mode === 'foot' && dist(f, st.anchor) > 24) {
      this.closePanel();
      return;
    }
    if (this.voice) return;
    const d = k.digit();
    if (st.type === 'loot') this.lootKeys(k, d);
    else if (st.type === 'storage') this.storageKeys(k, d);
    else if (st.type === 'garage') this.garageKeys(k, d);
  }

  lootDest(e) {
    const car = this.car();
    if (car && dist(car, e) < 32 && !VEHICLE[car.model].enemyOnly) {
      return { list: car.storage, cap: capacityOf(car), car, newId: () => newId(this.S), where: 'trunk' };
    }
    return { list: this.S.hands, cap: handsCap(), car: null, newId: () => newId(this.S), where: 'hands' };
  }

  openLoot(e) {
    this.panelState = { type: 'loot', e, anchor: e };
    this.renderLoot();
  }

  renderLoot() {
    const e = this.panelState.e;
    const dest = this.lootDest(e);
    const car = this.car();
    // Note: a part earns the glyph when it fits the current car and is worn no more than the installed one.
    const upgrade = (it) => {
      if (it.k !== 'part' || !car || VEHICLE[car.model].slots[it.slot] !== VEHICLE[it.model].slots[it.slot]) return false;
      const cur = car.parts[it.slot];
      return !cur || Math.round(it.cond) >= Math.round(cur.cond);
    };
    const rows = lootList(e).slice(0, 9).map((it, i) => {
      const up = upgrade(it);
      return { key: String(i + 1), label: it.label, info: [up ? '▲' : '', it.big ? 'tow' : ''].filter(Boolean).join(' '), cls: up ? 'good' : '', off: it.big };
    });
    if (!rows.length) rows.push({ label: 'Nothing left.', off: true });
    const title = e.kind === 'crate' ? 'Crate' : `${VEHICLE[e.model].short}${e.fresh ? ' (fresh)' : ''}`;
    const tag = lootList(e).some((it) => it.big) ? ' · T tag for tow' : '';
    const legend = rows.some((r) => r.cls === 'good') ? ' · ▲ fits' : '';
    this.hud.panel(title, rows, `Space all · ${dest.where} ${dest.list.length}/${dest.cap}${tag}${legend} · E close`, e.note);
    this.panelState.items = lootList(e).slice(0, 9);
  }

  lootKeys(k, d) {
    const st = this.panelState;
    const e = st.e;
    const dest = this.lootDest(e);
    let msg = '';
    if (d >= 1 && d <= st.items.length) msg = takeLoot(this.S, e, st.items[d - 1], dest);
    else if (k.hit('Space')) {
      const out = [];
      for (const it of lootList(e)) if (!it.big) out.push(takeLoot(this.S, e, it, dest));
      msg = out.filter(Boolean).join(' ');
    } else if (k.hit('KeyT') && e.kind === 'wreck') {
      this.S.towTag = e.id;
      msg = 'Tagged.';
    } else return;
    if (msg) this.hud.toast(msg, 3);
    this.audio?.ui('loot');
    this.persist(e);
    if (this.tutorial && e.tutorial && !e.parts.tires) this.S.flags.tutLoot = true;
    if (e.kind === 'crate' && !lootList(e).length) {
      const c = this.crates.find((q) => q.e === e);
      if (c) {
        c.spr.destroy();
        this.crates = this.crates.filter((q) => q !== c);
      }
      this.S.gone[e.id] = true;
      this.closePanel();
      return;
    }
    this.renderLoot();
  }

  // Note: generated entities keep their changes in S.mut; dynamic wrecks live in S.dyn already.
  persist(e) {
    if (!e.id || this.S.dyn.includes(e) || e.owner !== undefined && e.spr) return;
    this.S.mut[e.id] = {
      x: Math.round(e.x), y: Math.round(e.y), a: Math.round(e.a * 100) / 100,
      water: e.water, ammo: e.ammo, fuel: e.fuel, cans: e.cans, canFuel: e.canFuel, parts: e.parts, weapon: e.weapon ?? null,
    };
  }

  openStorage() {
    this.panelState = { type: 'storage', anchor: null };
    this.renderStorage();
  }

  renderStorage() {
    const S = this.S;
    const car = this.carInReach();
    const st = this.panelState;
    const drop = !!st.drop;
    const rows = [];
    const items = [];
    rows.push({ head: `Hands ${S.hands.length}/${handsCap()}` });
    for (const it of S.hands) {
      items.push({ it, from: 'hands' });
      rows.push({ key: String(items.length), label: itemLabel(it), info: drop ? 'drop' : car ? 'to trunk' : '' });
    }
    let side = null;
    st.pages = 1;
    if (car) {
      const v = VEHICLE[car.model];
      // Note: digits only reach nine items, so the car's load is paged around the hands.
      const per = 9 - S.hands.length;
      st.pages = Math.max(1, Math.ceil(car.storage.length / per));
      st.page = Math.min(st.page || 0, st.pages - 1);
      const pageTag = st.pages > 1 ? ` · page ${st.page + 1}/${st.pages}` : '';
      rows.push({ head: `${v.short}: ${v.storage[1]} + ${v.storage[3]} ${car.storage.length}/${capacityOf(car)}${pageTag}` });
      for (const it of car.storage.slice(st.page * per, st.page * per + per)) {
        items.push({ it, from: 'car' });
        rows.push({ key: String(items.length), label: itemLabel(it), info: drop ? 'drop' : carryable(it) ? 'to hands' : 'heavy' });
      }
      if (!car.storage.length) rows.push({ label: 'Empty.', off: true });
      side = [{ head: 'Parts' }];
      for (const slot of SLOTS) {
        const p = car.parts[slot];
        side.push({ label: SLOT_LABEL[slot], info: wearLabel(p), cls: !p || p.cond < 35 ? 'bad' : p.cond >= 60 ? 'good' : '' });
      }
      side.push({ label: 'Fuel', info: `${car.fuel.toFixed(1)} / ${v.tank} gal` });
    }
    if (this.tutorial) S.flags.tutTab = true;
    st.items = items;
    const flip = st.pages > 1 ? ' · Space next page' : '';
    const foot = drop ? `Number drops${flip} · X cancel` : `Number moves${flip}${car ? ' · P pour cans' : ''} · X drop · Z drink · Tab close`;
    this.hud.panel(drop ? 'Storage · drop' : 'Storage', rows, foot, '', side);
  }

  storageKeys(k, d) {
    const S = this.S;
    const car = this.carInReach();
    const st = this.panelState;
    if (k.hit('KeyZ')) {
      this.drinkWater();
      this.renderStorage();
      return;
    }
    if (k.hit('KeyP') && car) {
      const got = pourCans(car.storage.concat(S.hands), Math.max(0, VEHICLE[car.model].tank - car.fuel));
      car.fuel += got;
      this.hud.toast(got > 0 ? `Poured ${got.toFixed(1)} gal.` : 'Nothing to pour.');
      this.renderStorage();
      return;
    }
    if (k.hit('KeyX')) {
      st.drop = !st.drop;
      this.renderStorage();
      return;
    }
    if (k.hit('Space') && st.pages > 1) {
      st.page = ((st.page || 0) + 1) % st.pages;
      this.audio?.ui('click');
      this.renderStorage();
      return;
    }
    if (d < 1 || d > st.items.length) return;
    const { it, from } = st.items[d - 1];
    if (st.drop) {
      // Note: a dropped item is gone for good.
      removeItem(from === 'hands' ? S.hands : car.storage, it.id);
      st.drop = false;
      this.hud.toast(`Dropped ${itemLabel(it)}.`);
    } else if (from === 'hands') {
      if (!car) return;
      if (addItem(car.storage, capacityOf(car), it)) removeItem(S.hands, it.id);
      else this.hud.toast('Car\'s full.');
    } else if (!carryable(it)) {
      this.hud.toast('Too heavy.');
    } else if (addItem(S.hands, handsCap(), it)) {
      removeItem(car.storage, it.id);
    } else {
      this.hud.toast('Hands full.');
    }
    this.audio?.ui('click');
    this.renderStorage();
  }

  openGarage(site, mech, remark = '') {
    this.panelState = { type: 'garage', site, mech, anchor: mech, remark };
    this.renderGarage();
  }

  garageWrecks(site) {
    const park = site.park || site.garage;
    return this.wrecks.filter((w) => dist(w.e, park) < 200).map((w) => w.e);
  }

  renderGarage() {
    const S = this.S;
    const { site, mech } = this.panelState;
    const car = this.car();
    const park = site.park || site.garage;
    // Note: the mechanic works on anything by him or on the lot, where tows drop cars.
    const atLot = (o) => dist(o, mech) < 200 || dist(o, park) < 200;
    const here = car && atLot(car);
    const lists = this.waterLists();
    const price = (c, hours) => `${this.payWith === 'water' ? `${c.water} water` : `${c.ammo} rds`} · ${hours}`;
    const offers = [];
    const sections = [];
    const add = (sec, o, row) => {
      if (offers.length >= 9) return;
      offers.push(o);
      sec.rows.push({ ...row, key: String(offers.length), off: !canPay(S, o.cost, lists)[this.payWith] });
    };
    const swapRow = (slot, name, cur, next, note) => ({
      // Note: the change is taken from the shown whole percents, so it always adds up.
      slot: SLOT_LABEL[slot], name, cur: wearView(cur), next: wearView(next), delta: Math.round(next) - Math.round(cur ?? 0), note,
    });
    const misfits = [];
    if (here) {
      const v = VEHICLE[car.model];
      const fit = { head: `Fit · ${price(COSTS.install, '1 h each')}`, rows: [] };
      for (const it of car.storage.concat(S.hands)) {
        if (it.kind !== 'part') continue;
        const need = partName(v.slots[it.slot], v);
        if (!fits(it, v)) {
          misfits.push({ label: `${partLabel(it)} (${VEHICLE[it.from].short})`, info: `needs ${need}` });
          continue;
        }
        const old = car.parts[it.slot];
        const where = car.storage.includes(it) ? 'trunk' : 'hands';
        const fate = !old ? 'empty slot' : old.cond > 0 ? `${oldOnes(it.slot)} to ${where}` : `${oldOnes(it.slot)} scrapped`;
        add(fit, { kind: 'install', it, cost: COSTS.install }, swapRow(it.slot, need, old && old.cond, it.cond, `from ${where} · ${fate}`));
      }
      if (fit.rows.length) sections.push(fit);
      const pull = { head: `Pull from a wreck · ${price(COSTS.swap, '2 h each')}`, rows: [] };
      for (const o of donorOffers(car, this.garageWrecks(site))) {
        const old = car.parts[o.slot];
        const donor = VEHICLE[o.wreck.model].short;
        add(pull, { kind: 'swap', o, cost: COSTS.swap }, swapRow(o.slot, partName(v.slots[o.slot], v), old && old.cond, o.cond,
          `from the ${donor} · ${old ? `${oldOnes(o.slot)} into the wreck` : 'empty slot'}`));
      }
      if (pull.rows.length) sections.push(pull);
      for (const w of this.garageWrecks(site)) {
        const donor = VEHICLE[w.model];
        for (const slot of ['engine', 'transmission']) {
          if (w.parts?.[slot] > 0 && donor.slots[slot] !== v.slots[slot]) {
            misfits.push({ label: `${partName(donor.slots[slot], donor)} (${donor.short} on the lot)`, info: `needs ${partName(v.slots[slot], v)}` });
          }
        }
      }
    }
    const tow = { head: `Tow · ${price(COSTS.tow, '2 h + drive')}`, rows: [] };
    for (const c of Object.values(S.cars)) {
      if (atLot(c)) continue;
      const d = dist(c, park);
      const hours = towHours(d);
      add(tow, { kind: 'tow', target: c, own: true, cost: COSTS.tow, hours }, { label: `Your ${VEHICLE[c.model].short}`, info: `${(d * MILES_PER_PX).toFixed(1)} mi · ${Math.round(hours)} h` });
    }
    if (S.towTag) {
      const w = this.wrecks.find((q) => q.e.id === S.towTag);
      if (w && !atLot(w.e)) {
        const d = dist(w.e, park);
        const hours = towHours(d);
        add(tow, { kind: 'tow', target: w.e, cost: COSTS.tow, hours }, { label: `Tagged ${VEHICLE[w.e.model].short}`, info: `${(d * MILES_PER_PX).toFixed(1)} mi · ${Math.round(hours)} h` });
      }
    }
    if (tow.rows.length) sections.push(tow);
    if (misfits.length && car) sections.push({ head: 'Won\'t fit', rows: misfits });
    if (!offers.length) sections.unshift({ head: 'Nothing to do', rows: [{ label: here ? 'No fitting part. No donor on the lot.' : 'Car not on the lot.' }] });
    this.panelState.offers = offers;
    const pay = this.payWith === 'water' ? `${waterUnits(...lists)} water` : `${ammoTotal(S)} rds`;
    const where = !car ? 'No car.' : here ? `${VEHICLE[car.model].short} on the lot.` : `${VEHICLE[car.model].short} not on the lot.`;
    this.hud.garage({
      title: `${site.name || site.type} garage`,
      sub: `${where} ${pay}.`,
      remark: this.panelState.remark,
      sections,
      foot: `Number orders · P pay in ${this.payWith === 'water' ? 'ammo' : 'water'} · E close`,
    });
  }

  garageKeys(k, d) {
    const S = this.S;
    const st = this.panelState;
    if (k.hit('KeyP')) {
      this.payWith = this.payWith === 'water' ? 'ammo' : 'water';
      this.renderGarage();
      return;
    }
    if (d < 1 || d > st.offers.length) return;
    const o = st.offers[d - 1];
    const lists = this.waterLists();
    if (!canPay(S, o.cost, lists)[this.payWith]) {
      this.audio?.ui('deny');
      this.hud.toast('Can\'t pay.');
      return;
    }
    const car = this.car();
    let ok = true;
    let line = 'Give me an hour.';
    if (o.kind === 'install') {
      const list = car.storage.includes(o.it) ? car.storage : S.hands;
      const r = installPart(car, list, o.it);
      ok = r.ok;
      line = ok ? 'She\'ll run on that.' : r.why;
      if (ok && this.tutorial && o.it.slot === 'tires') S.flags.tutGarage = true;
    } else if (o.kind === 'swap') {
      const r = swapBig(car, o.o.wreck, o.o.slot, () => newId(S));
      ok = r.ok;
      line = ok ? 'It\'s in.' : r.why;
      this.persist(o.o.wreck);
    } else if (o.kind === 'tow') {
      const park = st.site.park || st.site.garage;
      const t = o.target;
      t.x = park.x + (Math.random() - 0.5) * 40;
      t.y = park.y + (Math.random() - 0.5) * 30;
      t.vx = 0;
      t.vy = 0;
      if (!o.own) this.persist(t);
      if (!o.own && S.towTag === t.id) S.towTag = null;
      line = 'It\'s on the lot.';
    }
    if (!ok) {
      this.hud.toast(line);
      return;
    }
    pay(S, o.cost, this.payWith, lists);
    const hours = o.hours || o.cost.hours;
    const events = stepSurvival(S, hours * HOUR_SECONDS, { takeWater: (n) => takeWater(n, ...this.waterLists()) });
    for (const ev of events) this.survivalEvent(ev);
    this.say(st.mech, line, 'Mechanic', 3);
    this.hud.toast(`${hours.toFixed(0)} h.`);
    this.audio?.ui('swap');
    this.disabledToast = false;
    this.autosave(true);
    if (this.panelState) this.renderGarage();
  }

  toggleMap(on) {
    this.mapOpen = on;
    this.hud.showMap(on);
    if (on) this.drawMap();
  }

  toggleHelp(on) {
    this.helpOpen = on;
    this.hud.showHelp(on);
  }

  drawMap() {
    const S = this.S;
    const W = this.world;
    const P = this.playerBody();
    const sites = W.sites.filter((s) => S.seen[s.id]).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, garage: s.type === 'garage' }));
    const garages = W.sites.filter((s) => s.type === 'garage' && S.seen[s.id]).map((s) => s.y + s.h / 2);
    const known = W.sites.filter((s) => s.type === 'garage');
    const lines = known.map((s) => (S.seen[s.id] ? `<p>${esc(s.name)} <span class="dim">${esc(FACTION_LABEL[s.faction] || '')}</span></p>` : '<p class="dim">?</p>'));
    const A = actOf(S.act);
    const goal = W.exitX ? W.exitX * TILE : (siteById(W, 'a5-exchange')?.y ?? 0) * TILE;
    const miles = Math.max(0, (P.y - goal) * MILES_PER_PX);
    const info = `<h3>${this.tutorial ? 'Yard' : `US ${A.road} west`}</h3><p>${miles.toFixed(0)} mi to ${A.goal}</p>${this.tutorial ? '' : lines.join('')}<p class="dim">West is up · amber garage · blue car</p>`;
    const gate = gateY(W);
    this.hud.drawMap(W, {
      px: P.x, py: P.y, sites, garages,
      rivers: (W.rivers || []).map((r) => r.x), checkpoint: gate != null && (S.flags.copCarKnown || S.act > 1 || this.S.p.y < gate + 2000) ? gate : null,
      cars: Object.values(S.cars).filter((c) => c.id !== S.carId || S.mode === 'foot'), info, blink: Math.floor(this.realT * 3) % 2 === 0,
    });
  }

  // ---------------------------------------------------------------- pressure, radio, beats

  // Note: wet roads dry out slower than the rain stops.
  stepWeather(real) {
    const S = this.S;
    this.rain = this.tutorial ? 0 : rainAt(S.seed, S.act, S.time);
    this.env.wet = Math.max(this.rain, (this.env.wet || 0) - real / 90);
    const on = this.rain > 0.2;
    if (on && !this.rainOn) this.hud.toast('Rain.', 3);
    this.rainOn = on;
  }

  stepPressure(dt) {
    const S = this.S;
    const P = this.playerBody();
    this.idleT = P.speed < 5 ? this.idleT + dt : 0;
    this.heatT += dt;
    if (this.heatT >= 0.5) {
      const car = this.car();
      let seen = 0;
      if (P.inCar && this.copCar()) {
        for (const p of this.people) {
          const g = p.g;
          if (g.state === 'down' || g.encounter || Math.abs(g.x - P.x) > 180 || Math.abs(g.y - P.y) > 180) continue;
          if (sees(this.world, { x: g.x, y: g.y, a: Math.atan2(P.y - g.y, P.x - g.x) }, P.x, P.y, 180, 3.2) > 0) seen += 0.5;
        }
      }
      stepHeat(S, this.heatT, {
        copCar: this.copCar(), seenBy: seen, inCar: P.inCar, moving: P.speed > 30,
        backRoad: onBackRoad(this.world, P.x, P.y), night: isNight(S.time), lights: !!(car && car.lights && P.inCar), idle: this.idleT, rain: this.rain,
      });
      this.heatT = 0;
      for (const s of this.world.sites) {
        if (!S.seen[s.id] && Math.abs((s.y + s.h / 2) * TILE - P.y) < 420 && Math.abs((s.x + s.w / 2) * TILE - P.x) < 520) S.seen[s.id] = true;
      }
    }
    if (!this.tutorial) this.stepRadio(dt);
  }

  radioCtx() {
    const S = this.S;
    const progress = clamp(1 - S.p.y / (this.world.h * TILE), 0, 1);
    return { night: isNight(S.time), progress, trip: (S.act - 1 + progress) / LAST_ACT, act: S.act, heat: S.heat, hunter: this.hunter };
  }

  stepRadio(dt) {
    const S = this.S;
    const R = S.radio;
    const st = STATIONS[R.station];
    const inCar = S.mode === 'car';
    const ctx = this.radioCtx();
    const sig = R.on && st ? signalOf(st.id, ctx) : 0;
    this.audio?.setRadio({ on: R.on && inCar, signal: sig });
    this.radioSig = sig;
    if (!R.on || !inCar) return;
    this.radioT -= dt;
    if (this.radioT > 0) return;
    this.radioT = 13 + Math.random() * 9;
    if (st.night && !ctx.night) {
      this.hud.radioLine(`${st.name}: ...dead air...`, 3);
      return;
    }
    const line = sig < 0.3 ? { id: null, text: '...static...' } : nextLine(S, st.id, ctx, Math.random);
    if (!line) return;
    if (line.id) R.heard[line.id] = true;
    if (line.fx) {
      if (line.fx.heat) bumpHeat(S, line.fx.heat);
      if (line.fx.flag) S.flags[line.fx.flag] = true;
    }
    this.hud.radioLine(`${st.name}: ${line.text}`, 8);
    this.audio?.radioVoice(Math.min(6, 1 + line.text.length / 16));
  }

  stepBeats() {
    const S = this.S;
    const P = this.playerBody();
    S.p = { x: P.x, y: P.y, a: P.a };
    if (this.tutorial) return;
    if (S.flags.hasSurvey && !S.flags.hunterHired && P.y < this.motelY - 2400) S.flags.hunterHired = true;
    if (this.exitY != null && P.y < this.exitY) {
      // Note: the road west only means something with the case; without it the courier turns back.
      if (S.flags.hasSurvey) this.crossBand();
      else if (!this.noCaseWarned) {
        this.noCaseWarned = true;
        this.hud.toast('The case. Room 4.', 4);
      }
    } else if (this.noCaseWarned && P.y > this.exitY + 200) this.noCaseWarned = false;
  }

  hourTick() {
    const S = this.S;
    if (!this.tutorial && darkness(S.time) > 0 && this.duskDay !== S.day && Math.floor((7 + S.time / HOUR_SECONDS) % 24) === 19) {
      this.duskDay = S.day;
      this.hud.toast('Dusk. Lights (F) give you away.', 4);
    }
  }

  survivalEvent(ev) {
    if (ev.kind === 'ration') this.hud.toast('06:00. -1 water.');
    if (ev.kind === 'thirst') this.hud.toast('No water. Wounds stay open.', 4);
    if (ev.kind === 'thirst-wound') {
      this.shake(150, 0.006);
      this.hud.toast('Thirst.');
    }
    if (ev.kind === 'death') this.die('thirst');
  }

  objectiveNow() {
    const S = this.S;
    if (this.tut) return TUTORIAL_STEPS[Math.min(this.tut.step, TUTORIAL_STEPS.length - 1)].text;
    const car = this.car();
    if (S.beat === 'motel') return OBJECTIVES.motel;
    if (S.beat === 'car') return OBJECTIVES.car;
    if (car && carStats(VEHICLE[car.model], car.parts).disabled) return OBJECTIVES.stranded;
    if (car && car.fuel <= 0) return ['Out of gas.', 'Siphon (E) or pour a can (Tab, P).'];
    if (S.act > 1) {
      const O = ACT_OBJECTIVES[S.act];
      const gate = gateY(this.world);
      if (gate != null && S.p.y < gate + 900 && S.p.y > gate - 40) return O.gate;
      if (O.ranch && S.flags.residentsCall && !S.flags.residentsMet && !S.flags.surveyFull && S.p.y > 1700 * TILE) return O.ranch;
      if (O.end && S.p.y < 1500 * TILE) return O.end;
      return O.west;
    }
    if (S.beat === 'cross') return OBJECTIVES.cross;
    if (S.p.y < CHECKPOINT_Y + 900) return OBJECTIVES.checkpoint;
    return OBJECTIVES.west;
  }

  stepTutorial() {
    const step = TUTORIAL_STEPS[this.tut.step];
    if (!step) return;
    if (step.done(this)) {
      this.tut.step += 1;
      this.audio?.ui('confirm');
      const next = TUTORIAL_STEPS[this.tut.step];
      if (next && next.enter) next.enter(this);
      if (!next) this.endTutorial();
    }
  }

  // ---------------------------------------------------------------- lifecycle

  cleanup() {
    const P = this.playerBody();
    const far = (o) => Math.abs(o.x - P.x) > 700 || Math.abs(o.y - P.y) > 700;
    for (const en of this.enemies.slice()) {
      if ((en.expire || en.mode === 'leave') && far(en.car)) {
        en.gone = true;
        en.spr.destroy();
        this.enemies = this.enemies.filter((e) => e !== en);
      }
    }
    for (const p of this.people.slice()) if (p.g.expire && far(p.g)) this.removePerson(p);
    this.hazards.remove((h) => h.y - P.y > 1200);
    for (const b of this.barriers.slice()) {
      if (b.expire && far(b)) {
        b.spr.destroy();
        this.barriers = this.barriers.filter((q) => q !== b);
      }
    }
    for (const p of this.props.slice()) {
      if (p.expire && far(p)) {
        p.spr.destroy();
        this.props = this.props.filter((q) => q !== p);
      }
    }
    for (const l of this.extraLights.slice()) {
      if (l.expire && far(l)) {
        l.spr?.destroy();
        this.extraLights = this.extraLights.filter((q) => q !== l);
      }
    }
  }

  autosave(force = false) {
    const S = this.S;
    if (this.tutorial || this.over || this.ending || S.dead || S.ended) return;
    if (!force && (this.director.hostileActive() || this.voice)) return;
    this.saveT = 0;
    writeSave(S);
  }

  die(cause) {
    if (this.over) return;
    this.over = true;
    const S = this.S;
    S.dead = true;
    if (!this.tutorial) deleteSave();
    const app = this.app;
    const name = S.name;
    const seed = S.seed;
    app.stopScene();
    app.showEnd({
      kicker: this.tutorial ? 'TUTORIAL' : '',
      title: DEATHS[cause] || DEATHS.wounds,
      copy: '',
      lines: this.tutorial ? [] : ending(S, 'dead', this.hunter).lines,
      stats: this.tutorial ? [] : this.runStats(),
      buttons: [
        { label: 'Same seed', primary: true, run: () => app.startScene(this.tutorial ? { mode: 'tutorial', name, seed: 'TUTORIAL' } : { mode: 'new', name, seed }) },
        { label: 'Title', run: () => app.showTitle() },
      ],
    });
  }

  runStats() {
    const S = this.S;
    const stance = Object.entries(S.standing).sort((a, b) => b[1] - a[1]);
    return [
      ['Act', `${S.act}/${LAST_ACT}`],
      ['Miles', Math.round(S.stats.miles).toString()],
      ['Days', String(S.day)],
      ['Wounds', `${S.wounds}/${WOUND_MAX}`],
      ['Kills', String(S.stats.kills)],
      ['Friendliest', stance[0] && stance[0][1] > 0 ? FACTION_LABEL[stance[0][0]] || stance[0][0] : 'nobody'],
      ['Hunter', HUNTER_LABEL[S.hunter] || HUNTER_LABEL.hunting],
      ['Seed', S.seed],
    ];
  }

  // Note: the far bank of the exit river is a new band; only the car the courier brings across comes along.
  crossBand() {
    if (this.over) return;
    this.over = true;
    const S = this.S;
    const from = S.act;
    const car = this.car();
    const keep = car && (S.mode === 'car' || dist(car, this.foot) < 250) ? car : null;
    if (keep) Object.assign(keep, { vx: 0, vy: 0, av: 0 });
    S.cars = keep ? { [keep.id]: keep } : {};
    S.carId = keep ? keep.id : null;
    S.act = from + 1;
    S.arrive = true;
    S.beat = 'west';
    Object.assign(S, { mut: {}, gone: {}, dyn: [], seen: {}, enc: {}, towTag: null });
    for (const k of BAND_FLAGS) delete S.flags[k];
    writeSave(S);
    const app = this.app;
    const card = actCard(from);
    app.stopScene();
    app.showEnd({
      ...card,
      stats: this.runStats(),
      buttons: [
        { label: 'Drive on', primary: true, run: () => {
          const save = loadSave();
          if (save) app.startScene({ mode: 'continue', save });
          else app.showTitle();
        } },
        { label: 'Title', run: () => app.showTitle() },
      ],
    });
  }

  // Note: an ending plays out for a moment on the road before the epilogue.
  finish(id) {
    if (this.over || this.ending) return;
    this.ending = { id, t: END_DELAY };
    this.S.ending = id;
    deleteSave();
  }

  showEnding(id) {
    if (this.over) return;
    this.over = true;
    const S = this.S;
    S.ended = true;
    deleteSave();
    const app = this.app;
    const e = ending(S, id, this.hunter);
    app.stopScene();
    app.showEnd({
      kicker: e.kicker, title: e.title, copy: e.copy, lines: e.lines,
      stats: this.runStats(),
      buttons: [{ label: 'Title', primary: true, run: () => app.showTitle() }],
    });
  }

  endTutorial() {
    if (this.over) return;
    this.over = true;
    const app = this.app;
    app.stopScene();
    app.showEnd({
      kicker: 'TUTORIAL',
      title: 'Done',
      copy: '',
      stats: [],
      buttons: [{ label: 'Title', primary: true, run: () => app.showTitle() }],
    });
  }

  setPaused(on) {
    this.paused = on;
    const S = this.S;
    this.hud.showPause(on, this.tutorial ? 'Tutorial · not saved' :`${S.name} · day ${S.day} · seed ${S.seed}`);
    if (on) this.audio?.setEngine({ on: false });
  }

  wirePause() {
    const resume = document.getElementById('btnResume');
    const mute = document.getElementById('btnMute');
    const quit = document.getElementById('btnQuit');
    this.onResume = () => this.setPaused(false);
    this.onMute = () => {
      this.muted = !this.muted;
      this.audio?.setMuted(this.muted);
      mute.textContent = this.muted ? 'Unmute' : 'Mute';
    };
    this.onQuit = () => {
      this.autosave(true);
      this.over = true;
      this.app.stopScene();
      this.app.showTitle();
    };
    resume.addEventListener('click', this.onResume);
    mute.addEventListener('click', this.onMute);
    quit.addEventListener('click', this.onQuit);
    this.unwirePause = () => {
      resume.removeEventListener('click', this.onResume);
      mute.removeEventListener('click', this.onMute);
      quit.removeEventListener('click', this.onQuit);
    };
  }

  debugHooks() {
    this.app.debug = {
      scene: this,
      teleport: (bandX) => {
        const y = bandX * TILE;
        const x = (this.world.kind === 'band' ? roadX(this.world, bandX) : this.world.w / 2) * TILE;
        const car = this.car();
        if (this.S.mode === 'car' && car) {
          car.x = x;
          car.y = y;
          car.vx = 0;
          car.vy = 0;
          car.a = UP;
        } else {
          this.foot.x = x;
          this.foot.y = y;
        }
      },
      setTime: (h) => {
        this.S.time = (((h - 7 + 24) % 24) + 24 * (this.S.day - 1)) * HOUR_SECONDS;
      },
      setHeat: (n) => {
        this.S.heat = n;
      },
      give: (what, n = 1) => {
        if (what === 'water') this.giveWater(n);
        if (what === 'ammo') this.S.ammo += n;
        if (what === 'fuel' && this.car()) this.car().fuel += n;
        if (what === 'wound') addWound(this.S, n, 'shot');
        if (WEAPONS[what] && !this.S.weapons.includes(what)) this.S.weapons.push(what);
      },
      enterCar: () => this.enterCar(this.car()),
      state: () => this.S,
      flag: (k, v = true) => {
        this.S.flags[k] = v;
      },
      hunter: (st) => {
        this.S.hunter = st;
      },
      // Note: skips ahead: crosses into act n with the current car and kit, the survey in hand.
      gotoAct: (n) => {
        const S = this.S;
        S.flags.hasSurvey = true;
        S.flags.hunterHired = true;
        S.act = Math.max(1, Math.min(LAST_ACT, n) - 1);
        this.crossBand();
        const save = loadSave();
        if (save) this.app.startScene({ mode: 'continue', save });
      },
      finish: (id) => this.finish(id),
      encounters: () => this.director.list.map((e) => `${e.id}:${this.S.enc[e.id] || (this.director.live.has(e.id) ? 'live' : '-')}`),
    };
  }

  teardown() {
    this.over = true;
    this.input2.destroy();
    this.chunks.destroy();
    this.canopy.destroy();
    this.canopyHole.destroy();
    this.lighting.destroy();
    this.bullets.destroy();
    this.hazards.destroy();
    this.doorG?.destroy();
    this.hud.reset();
    this.unwirePause();
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onHide);
    for (const r of [...this.roofs, ...this.structs]) {
      r.img.destroy();
      if (this.textures.exists(r.key)) this.textures.remove(r.key);
    }
    this.audio?.setEngine({ on: false });
    this.audio?.setSkid(0);
    this.audio?.setRadio({ on: false });
    this.audio?.heartbeat(0);
  }

  // ---------------------------------------------------------------- render

  render(dt) {
    const S = this.S;
    const car = this.car();
    const inCar = S.mode === 'car' && car;
    for (const v of this.carViews.values()) v.spr.setPosition(v.car.x, v.car.y).setRotation(v.car.a);
    for (const w of this.wrecks) if (w.e.vx || w.e.vy || w.moved) w.spr.setPosition(w.e.x, w.e.y).setRotation(w.e.a);
    for (const r of this.runners) r.spr.setPosition(r.e.x, r.e.y).setRotation(r.e.a);
    for (const p of this.props) p.spr.setPosition(p.x, p.y).setRotation(p.a);
    for (const b of this.barriers) b.spr.setPosition(b.x, b.y);
    for (const en of this.enemies) en.spr.setPosition(en.car.x, en.car.y).setRotation(en.car.a);
    for (const p of this.people) {
      const g = p.g;
      if (g.state === 'down') continue;
      const frame = g.moving ? 1 + (Math.floor((g.walk || 0) / 3.5) % 2) : 0;
      const armed = p.armed && g.state === 'alert';
      this.skin(p.spr, (d) => personKey(this, g.look, frame, armed, d), g.small ? 0.75 : 1).setPosition(g.x, g.y).setRotation(g.a);
    }
    const f = this.foot;
    this.footSpr.setVisible(!inCar);
    if (!inCar) {
      const moving = Math.hypot(f.vx, f.vy) > 8;
      const frame = moving ? 1 + (Math.floor(f.walk / 3.5) % 2) : 0;
      this.skin(this.footSpr, (d) => personKey(this, 'courier', frame, false, d)).setPosition(f.x, f.y).setRotation(f.a);
    }
    this.updateRoofs(dt, inCar);
    this.drawCones(inCar);
    this.drawReticle(inCar, car);
    this.bullets.draw();
    this.hazards.draw();
    this.drawRain(dt);
    for (const fl of this.flashes) fl.t -= dt;
    this.flashes = this.flashes.filter((fl) => fl.t > 0);
    this.updateCamera();
    this.drawLights(inCar, car);
    this.updateAudio(inCar, car);
    this.updateHud(dt, inCar, car);
  }

  updateCamera() {
    const S = this.S;
    const car = this.car();
    const inCar = S.mode === 'car' && car;
    const t = inCar ? car : this.foot || S.p;
    const cam = this.cameras.main;
    // Note: the camera leads the car along the corridor and eases back while a chaser sits behind it.
    let tx = 0;
    let ty = 0;
    if (inCar) {
      const hx = Math.cos(car.a);
      const hy = Math.sin(car.a);
      const chased = this.enemies.some((en) => !en.dead && en.mode !== 'park' && (en.car.x - car.x) * hx + (en.car.y - car.y) * hy < 0 && dist(en.car, car) < 400);
      const k = chased ? 0.35 : 1;
      tx = clamp(car.vx * LEAD_T, -LEAD_X, LEAD_X) * k;
      ty = clamp(car.vy * LEAD_T, -LEAD_Y, LEAD_Y) * k;
    }
    const L = this.camLead;
    // Note: a jump (teleport, new body) snaps the lead instead of gliding in from an old offset.
    const jump = !L || L.t !== t || Math.hypot(t.x - L.x0, t.y - L.y0) > 64;
    const ease = jump ? 1 : 1 - Math.exp(-2.5 * (this.dt || 0));
    const lx = jump ? tx : L.x + (tx - L.x) * ease;
    const ly = jump ? ty : L.y + (ty - L.y) * ease;
    this.camLead = { t, x: lx, y: ly, x0: t.x, y0: t.y };
    const want = inCar ? 1 : FOOT_ZOOM;
    const z0 = this.zoom ?? want;
    const z = Math.abs(want - z0) < 0.01 ? want : z0 + (want - z0) * (1 - Math.exp(-9 * (this.dt || 0)));
    this.zoom = z;
    cam.setZoom(z);
    const lod = z >= 1.5 ? 2 : 1;
    if (lod !== this.lod) {
      this.lod = lod;
      for (const o of this.children.list) if (o.skin) this.skin(o, o.skin.fn, o.skin.sx, o.skin.sy);
    }
    // Note: scroll snaps to whole screen pixels; the dashboard shift is in screen pixels too.
    const snap = (v) => Math.round(v * z) / z;
    cam.setScroll(snap(t.x + lx - VIEW_W / 2), snap(t.y + ly - VIEW_H / 2 + 13 / z));
    const vw = VIEW_W / z;
    const vh = VIEW_H / z;
    this.chunks.update({ x: cam.scrollX + (VIEW_W - vw) / 2, y: cam.scrollY + (VIEW_H - vh) / 2, width: vw, height: vh }, 1);
    this.canopyHole.setTexture(holeKey(this, CANOPY_HOLE[lod])).setPosition(Math.round(t.x), Math.round(t.y));
    // Note: screen-space overlays sit on the zoomed camera, so they are scaled back to cover the screen exactly.
    const ox = (VIEW_W / 2) * (1 - 1 / z);
    const oy = (VIEW_H / 2) * (1 - 1 / z);
    this.lighting.img.setScale(1 / z).setPosition(ox, oy);
    this.rainG.setScale(1 / z).setPosition(ox, oy);
  }

  // Note: sprites carry two texel densities, 1 per px for the car view and 2 on foot; fn(d) returns the texture key.
  skin(img, fn, sx = 1, sy = sx) {
    img.skin = { fn, sx, sy };
    const d = this.lod || 1;
    return img.setTexture(fn(d)).setScale(sx / d, sy / d);
  }

  // Note: a world point in screen game pixels under the current zoom.
  toScreen(x, y) {
    const cam = this.cameras.main;
    const z = cam.zoom;
    return { x: (x - cam.scrollX - VIEW_W / 2) * z + VIEW_W / 2, y: (y - cam.scrollY - VIEW_H / 2) * z + VIEW_H / 2 };
  }

  // Note: Phaser's shake grows with the square of the zoom, so it is scaled back to the same screen size.
  shake(ms, intensity) {
    const z = this.cameras.main.zoom;
    this.cameras.main.shake(ms, intensity / (z * z));
  }

  // Note: screen-space streaks over a slight dim; they drift against the camera so the rain feels fixed to the world.
  drawRain(dt) {
    const g = this.rainG;
    g.clear();
    const cam = this.cameras.main;
    const last = this.lastCam || { x: cam.scrollX, y: cam.scrollY };
    const mx = (cam.scrollX - last.x) * cam.zoom;
    const my = (cam.scrollY - last.y) * cam.zoom;
    this.lastCam = { x: cam.scrollX, y: cam.scrollY };
    const n = Math.round(this.rain * 170);
    if (!n) return;
    while (this.drops.length < n) this.drops.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, s: 0.6 + Math.random() * 0.6 });
    g.fillStyle(hexOf(C.SHADOW), 0.08 + 0.14 * this.rain);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.lineStyle(1, hexOf(C.BONE_L), 0.3 + 0.3 * this.rain);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d.x = (((d.x - 45 * d.s * dt - mx * 0.7) % VIEW_W) + VIEW_W) % VIEW_W;
      d.y = (((d.y + 320 * d.s * dt - my * 0.7) % VIEW_H) + VIEW_H) % VIEW_H;
      g.lineBetween(d.x, d.y, d.x + 2 * d.s, d.y - 9 * d.s);
    }
  }

  updateRoofs(dt, inCar) {
    const f = this.foot;
    const key = `${Math.floor(f.x / CELL)},${Math.floor(f.y / CELL)}`;
    for (const r of this.roofs) {
      const inside = !inCar && r.set.has(key);
      const want = inside ? 0 : 1;
      r.alpha += (want - r.alpha) * Math.min(1, dt * 8);
      r.img.setAlpha(r.alpha);
    }
    this.updateDoors(dt);
  }

  // Note: a door under a roof shows while the courier has a clear line to it, and stays faintly marked once seen.
  updateDoors(dt) {
    const P = this.playerBody();
    const check = (this.doorT -= dt) <= 0;
    if (check) this.doorT = 0.1;
    const dark = this.tutorial ? 0 : darkness(this.S.time);
    const range = 260 * (1 - 0.45 * dark) * (1 - 0.35 * (this.rain || 0));
    const g = this.doorG;
    g.clear();
    for (const r of this.roofs) {
      for (const d of r.doors) {
        if (check) {
          const near = Math.abs(d.x - P.x) < range && Math.abs(d.y - P.y) < range;
          d.vis = near && Math.hypot(d.x - P.x, d.y - P.y) < range && los(this.world, P.x, P.y, d.x, d.y);
          if (d.vis) d.seen = true;
        }
        const want = d.vis ? 1 : d.seen ? 0.4 : 0;
        d.a += (want - d.a) * Math.min(1, dt * 10);
        const a = d.a * r.alpha;
        if (a < 0.02) continue;
        // Note: a doorway drawn in half-pixel steps to match the double-density roofs.
        const x = d.x - d.w / 2;
        const y = d.y - d.h / 2;
        g.fillStyle(hexOf(C.BONE), a);
        g.fillRect(x + 0.5, y + 0.5, d.w - 1, d.h - 1);
        g.fillStyle(hexOf(C.VOID), a);
        g.fillRect(x + 1, y + 1, d.w - 2, d.h - 2);
        g.fillStyle(hexOf(C.AMBER), a);
        g.fillRect(x + d.w - 2, y + d.h / 2 - 0.5, 1, 1);
      }
    }
  }

  // Note: guard sight is drawn only on foot, where stealth matters.
  drawCones(inCar) {
    const g2 = this.cones;
    g2.clear();
    if (inCar) return;
    const night = this.tutorial ? 0 : darkness(this.S.time);
    const vis = (night > 0.45 && !this.playerLit(this.playerBody()) ? 0.45 : 1) * (1 - 0.35 * this.rain);
    for (const p of this.people) {
      const g = p.g;
      if (g.kind !== 'guard' || g.state === 'down' || dist(g, this.foot) > 300) continue;
      const col = g.state === 'alert' ? C.RED : g.sus > 0.3 ? C.AMBER : C.BONE;
      g2.fillStyle(hexOf(col), g.state === 'alert' ? 0.16 : 0.1 + g.sus * 0.1);
      const r = g.range * vis;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = g.a - 0.75 + (1.5 * i) / n;
        const a1 = g.a - 0.75 + (1.5 * (i + 1)) / n;
        g2.fillTriangle(g.x, g.y, g.x + Math.cos(a0) * r, g.y + Math.sin(a0) * r, g.x + Math.cos(a1) * r, g.y + Math.sin(a1) * r);
      }
    }
  }

  drawReticle(inCar, car) {
    const g = this.reticle;
    g.clear();
    if ((!inCar && !this.drawn) || this.panelState) return;
    const m = this.mouseWorld();
    const ok = !inCar || inArc(car.a, Math.atan2(m.y - car.y, m.x - car.x));
    // Note: the reticle keeps its screen size; u is one screen pixel in world units.
    const u = 1 / this.cameras.main.zoom;
    const mx = Math.round(m.x / u) * u;
    const my = Math.round(m.y / u) * u;
    g.lineStyle(u, hexOf(ok ? C.YELLOW : C.RED), ok ? 0.9 : 0.6);
    if (ok) {
      g.strokeRect(mx - 3.5 * u, my - 3.5 * u, 7 * u, 7 * u);
      if (this.reloadT > 0) g.strokeRect(mx - 1.5 * u, my - 1.5 * u, 3 * u, 3 * u);
    } else {
      g.lineBetween(m.x - 3 * u, m.y - 3 * u, m.x + 3 * u, m.y + 3 * u);
      g.lineBetween(m.x - 3 * u, m.y + 3 * u, m.x + 3 * u, m.y - 3 * u);
    }
  }

  drawLights(inCar, car) {
    const dark = this.tutorial ? 0 : darkness(this.S.time);
    if (dark <= 0.01) {
      this.lighting.draw(0, []);
      return;
    }
    // Note: lights are drawn in screen pixels, so positions and radii follow the zoom.
    const z = this.cameras.main.zoom;
    const lights = [];
    const push = (l) => {
      const p = this.toScreen(l.x, l.y);
      lights.push({ ...l, x: p.x, y: p.y, r: l.r * z });
    };
    const cone = (c, r) => {
      const fx = c.x + Math.cos(c.a) * (VEHICLE[c.model].len / 2);
      const fy = c.y + Math.sin(c.a) * (VEHICLE[c.model].len / 2);
      push({ kind: 'cone', x: fx, y: fy, a: c.a, spread: 0.42, r });
    };
    if (car && car.lights && car.running) cone(car, 170);
    for (const en of this.enemies) if (!en.dead && en.mode !== 'park') cone(en.car, 120);
    for (const l of this.allLights()) push({ kind: 'radial', x: l.x, y: l.y, r: l.r, power: l.kind === 'fire' ? 0.9 + Math.sin(this.realT * 9) * 0.05 : 0.85 });
    for (const fl of this.flashes) push({ kind: 'radial', x: fl.x, y: fl.y, r: 46, power: 1 });
    for (const h of this.hazards.list) if (h.kind === 'fire') push({ kind: 'radial', x: h.x, y: h.y, r: 72, power: 0.9 + Math.sin(this.realT * 11 + h.x) * 0.06 });
    const P = this.playerBody();
    push({ kind: 'radial', x: P.x, y: P.y, r: inCar ? 30 : 12, power: 0.45 });
    this.lighting.draw(dark, lights);
  }

  updateAudio(inCar, car) {
    const a = this.audio;
    if (!a) return;
    const S = this.S;
    if (inCar) {
      const d = VEHICLE[car.model].drive;
      a.setEngine({ on: car.running, rev: car.rev, red: d.red, cyl: d.cyl, load: car.load, gear: car.gear, damage: 1 - (car.parts.engine ? car.parts.engine.cond / 100 : 0) });
      a.setSkid(car.skid);
    } else {
      a.setEngine({ on: false });
      a.setSkid(0);
    }
    const f = this.foot;
    const indoor = !inCar && cellPropsAtPx(this.world, f.x, f.y).indoor;
    a.setAmbience({ night: this.tutorial ? 0 : darkness(S.time), wind: 0.3 + 0.4 * this.rain, speed: inCar ? clamp(speedOf(car) / (100 * MPH_PX), 0, 1) : 0, indoor, rain: this.rain, inCar: !!inCar });
    a.heartbeat(S.wounds >= 3 ? (S.wounds - 2) / 3 : 0);
  }

  updateHud(dt, inCar, car) {
    const S = this.S;
    const hud = this.hud;
    hud.tick(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const st = STATIONS[S.radio.station];
      const w = WEAPONS[S.weapon];
      hud.dash({
        fuel: car ? car.fuel : 0, tank: car ? VEHICLE[car.model].tank : 0, mph: inCar && car ? Math.round(speedOf(car) / MPH_PX) : null, water: waterUnits(...this.waterLists()),
        gun: w.short, mag: S.mag, ammo: S.ammo, reloading: this.reloadT > 0, parts: car ? car.parts : null, temp: car ? car.temp : 0,
        station: S.radio.on && st ? st.name : 'RADIO OFF', signal: S.radio.on && st ? (inCar ? signalBars(this.radioSig || 0) : 'in the car') : '',
        day: S.day, clock: clockText(S.time), onFoot: !inCar && !this.drawn,
      });
      hud.objective(this.objectiveNow());
      hud.wound(Math.min(0.95, S.wounds * 0.18 + (S.thirst ? 0.12 : 0)));
      if (this.mapOpen) this.drawMap();
    }
    const t = this.target;
    hud.prompt(t && !this.panelState && !this.voice ? `<kbd>E</kbd> ${esc(t.label)}` : '');
    const v = this.voice;
    // Note: a voice waiting for an answer sits in a fixed slot so it never covers the car.
    if (v) hud.voice(v, VIEW_W / 2, 0, (r) => this.canAfford(r.need));
    else hud.voice(null);
    hud.barks(this.barks.map((b) => {
      const p = this.toScreen(b.speaker.x, b.speaker.y - 6);
      return { id: b.id, who: b.who, text: b.text, hostile: b.hostile, sx: p.x, sy: p.y };
    }));
  }
}

const FACTION_LABEL = { company: 'Permian W&L', brigade: 'St. Jude Brigade', coop: 'Llano Co-op', residents: 'the Residents', drifters: 'drifters', none: '' };
const HUNTER_LABEL = { hunting: 'still hunting', bought: 'bought off', misled: 'misled', dead: 'dead' };

const hexOf = hexNum;

// Note: "old battery", "old tires".
const oldOnes = (slot) => `old ${SLOT_LABEL[slot].toLowerCase()}`;

// Note: a part condition as dashboard text plus a color class.
const wearView = (cond) => ({
  text: cond == null ? 'missing' : `${tierOf(cond)} ${Math.round(cond)}%`,
  cls: cond == null || cond < 35 ? 'bad' : cond >= 60 ? 'good' : '',
});

function signalBars(sig) {
  const n = Math.round(clamp(sig, 0, 1) * 5);
  return `${'|'.repeat(n)}${'.'.repeat(5 - n)}`;
}
