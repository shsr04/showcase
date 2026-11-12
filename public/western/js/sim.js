// Note: Sim runs one breach attempt: world, actors, senses, combat and outcome; no DOM or Phaser.

import { STEP, FOV_PRESETS, FOV_PRESET, RADIUS, SPEED, CROUCH_MUL, PRONE_MUL, LEAN_MUL, CHEST_Z, HEAD_Z, HEIGHT, SAFE_DIST, FLOOR_H, EYE_Z, STAIR_SPEED, MAP_W, MAP_H } from './config.js';
import { clamp, angleDiff, dist } from './rand.js';
import { T, DS, WS, isFlight, cellObstacle } from './tiles.js';
import { tileAt, stateAt, setState, solidAt, railStrip } from './map.js';
import { generateHouse, houseMap } from './house.js';
import { findPath, flightOf, goalKey } from './nav.js';
import { castRay, inPoly, eyePosition, viewField, fieldOutline, zoneIndex, canSeePoint, canSeePoint3, makeShaft, throughViews, absZ, BODY_Z } from './los.js';
import { propagate, SOUND_LEVELS, hearingThreshold } from './sound.js';
import { newFocus, stepFocusView, focusWindow } from './focus.js';
import { WEAPONS, fireWeapon, tickWeapon, stepSettle, disruptAim, aimQuality, sigmaFor, proneAimFactor, startReload as beginReload, stepReload, cancelReload, canFireWhileReloading, stepBullet, clearShotToActor } from './weapons.js';
import { updateWounds, dieOfWound, applyHit, capability, hitReaction, LYING_H, HEAD_R, ONE_ARM_RELOAD, SHOCK } from './wounds.js';
import { makeActor, weaponOf, isLawman } from './actors.js';
import { handOf, armHitEffect, bestUsable, usable, canCarry, dropSpot, itemUseful, unit, ONE_HAND_DRAW, ITEM_TIME, ITEM_REACH } from './arms.js';
import { think, muzzleBlocked, walks } from './ai.js';
import { runCommand } from './comms.js';
import { normalizeSite, normalizeParty, applyMember, partySlot } from './party.js';
import { snapshot } from './tactical-memory.js';
import { initialZones, lookOver } from './tactical-zones.js';
import { groundAt, groundOf, slopeSpeed } from './terrain-height.js';
import { armDynamite, blastIntent, stepBlasting, dodgeBlast } from './dynamite.js';
import { considerSurrender, watchWanted, stepPleas, custodyUse, acceptSurrender, secureTarget, deputiesSecure, SECURE_REACH, SECURE_BREAK, SECURE_TIME } from './surrender.js';

// Note: actions that pin the actor in place; reloading and switching still allow slow movement.
const LOCKS = new Set(['door', 'window', 'scavenge', 'pickup', 'knife', 'custody']);
const SLOW = new Set(['reload', 'switch']);
// Note: on the flight the floor flips when the eye passes the slab.
const FLIP_Z = FLOOR_H - EYE_Z.stand;
const IDLE = { move: null };
const TURN = { sheriff: 12, deputy: 6, hostile: 5, civilian: 4 };
// Note: a hostile turns half a circle in about 0.8 s (green), 0.6 s (seasoned) or 0.5 s (veteran).
const EXP_TURN = { green: 0.8, seasoned: 1, veteran: 1.25 };
const EXP_RANGE = { green: 0.85, seasoned: 1, veteran: 1.1 };
// Note: the share by which open daylight lengthens every sight zone outdoors.
export const OUTDOOR_SIGHT = 1.5;
const FAIL_DELAY = 3;
const WIN_DELAY = 1.5;
// Note: a deputy says "Clear." at most once in this many seconds; positions checked meanwhile go out with the next call.
const CLEAR_GAP = 8;
const PUSH_SPEED = 2.5;
export const KNIFE_REACH = 1.15;
export const KNIFE_TIME = 0.45;
const KNIFE_ARC = Math.PI / 3;
const KNIFE_Z = CHEST_Z.stand;
const KNIFE_BODY = 0.25;
// Note: a side aim point sits this far to the side of the target's centre; a head point sits closer, inside the head circle.
const SIDE_AIM = 0.18;
const KNIFE_WORDS = { front: 'Not from the front.', aim: 'Face him first.', blocked: 'Something is in the way.', range: 'He moved away.', target: 'Too late.', prone: 'Not from the ground.', arm: 'Not with this arm.' };

// Note: a look or a shot between the two leaves their floor or starts or ends on the flight.
const acrossFloor = (a, t) => t.floor !== a.floor || !!t.elev || !!a.elev;

const EDGE_KEYS = ['reload', 'knife', 'dynamite', 'switch', 'interact', 'command', 'toggleSignal', 'toggleSprint', 'toggleSlow', 'toggleFarAim', 'toggleProne'];
const edgeless = (i) => ({ ...i, reload: false, knife: false, dynamite: false, switch: false, interact: false, command: 0, toggleSignal: false, toggleSprint: false, toggleSlow: false, toggleFarAim: false, toggleProne: false });

export class Sim {
  constructor(seed, opts = {}) {
    this.seed = seed;
    // Note: opts.site is any house-like site and opts.party the lawmen; with neither this is the default house and party.
    this.house = normalizeSite(opts.site || generateHouse(seed));
    this.party = normalizeParty(opts.party);
    this.map = houseMap(this.house);
    this.shaft = makeShaft(this.house.flights?.length ? this.house.flights : this.house.stairs);
    this.rand = opts.rand || Math.random;
    this.opts = opts;
    // Note: opts.fov names a vision preset, natural zones or the classic single cone; the default follows ?fov= in the address.
    this.fovCfg = FOV_PRESETS[opts.fov] || FOV_PRESETS[FOV_PRESET];
    this.time = 0;
    this.acc = 0;
    this.pending = null;
    this.tickN = 0;
    this.nextId = 1;
    this.actors = [];
    this.bullets = [];
    this.decals = [];
    this.items = [];
    this.nextItem = 1;
    this.events = [];
    this.soundLog = [];
    this.outcome = null;
    this.rumor = this.house.rumor;
    this.signal = false;
    this.pace = 'walk';
    this.farAim = false;
    this.prone = false;
    this.input = {};
    this.civilian = null;
    this.hostiles = [];
    this.deputies = [];
    this.lawmen = [];
    this.lastFollow = null;
    this.viewCache = null;
    this.throughCache = null;
    this.spawn();
    // Note: item 499: opts.dynamite is the number of sticks the sheriff carries, the Ironman reward; none without it.
    armDynamite(this, opts.dynamite);
  }

  spawn() {
    const h = this.house;
    const slots = h.spawn.slots;
    this.sheriff = this.addLawman('sheriff', slots[0], this.party.sheriff);
    const taken = slots.slice();
    this.deputies = this.party.deputies.map((m, i) => {
      const at = partySlot(this.map, slots, i + 1, taken);
      taken.push(at);
      return Object.assign(this.addLawman('deputy', at, m), { look: i });
    });
    this.lawmen = [this.sheriff, ...this.deputies];
    const startingZones = initialZones(this, this.lawmen);
    for (const a of this.lawmen) {
      a.ai.zones = new Map(startingZones);
      a.ai.people = new Map(this.lawmen.filter((b) => b !== a).map((b) => [b.id, snapshot(b, this.time)]));
    }
    h.hostiles.forEach((o, i) => {
      const a = this.add('hostile', o, {
        name: o.associate ? o.associate.name : o.wanted?.name || `Hostile ${i + 1}`, facing: o.facing, experience: o.experience, nerve: o.nerve, habit: o.habit,
        loadout: o.loadout, reserve: o.reserve,
      });
      if (o.associate) Object.assign(a, { associate: true, face: o.associate.face || '' });
      // Note: item 492: the ordinary wanted target of a case, who alone of his gang may offer surrender.
      else if (o.wanted) a.wanted = true;
      // Note: an outdoor gang's place in camp: a sentry at his post, a walker with his round.
      if (o.role) a.campRole = o.role;
      if (o.route) a.route = o.route.map((p) => ({ x: p.x, y: p.y, f: 0 }));
      this.hostiles.push(a);
    });
    if (h.civilian) this.civilian = this.add('civilian', h.civilian, { name: 'Civilian', kind: h.civilian.kind });
    // Note: item 470: outside an ambush, a gang that keeps a watch has its first men wary at their posts, quicker to notice and to ready a gun, but not yet searching.
    // Note: the posted sentries of an outdoor camp are the men on watch, before the rest.
    const watchFirst = [...this.hostiles.filter((o) => o.campRole === 'sentry'), ...this.hostiles.filter((o) => o.campRole !== 'sentry')];
    const wary = this.opts.ambush ? [] : watchFirst.slice(0, this.opts.lookouts || 0);
    for (const o of wary) o.ai.wary = true;
    if (this.opts.ambush) for (const o of this.hostiles) this.ambushed(o);
  }

  // Note: in an ambush the hostiles start wary and on their way to where the party stands, so they notice and ready their guns faster.
  ambushed(o) {
    const at = this.house.spawn.slots[0];
    o.ai.wary = true;
    o.ai.state = 'search';
    o.ai.since = 0;
    o.ai.pos = { x: at.x, y: at.y, f: at.floor ?? 0 };
    o.alert = true;
  }

  addLawman(role, slot, m) {
    const a = this.add(role, slot, { name: m.name, facing: -Math.PI / 2, loadout: m.loadout, reserve: m.reserve, ...(m.hand ? { hand: m.hand } : {}) });
    return applyMember(a, m);
  }

  // Note: the lead deputy is the first one still on his feet, else the first; null when the party has none.
  get deputy() {
    return this.deputies.find((d) => d.status === 'ok') || this.deputies[0] || null;
  }

  add(role, p, o) {
    const id = this.nextId++;
    const a = makeActor(id, role, p.x, p.y, p.floor ?? 0, { hand: handOf(this.seed, id, role), ...o });
    a.salt = this.seed;
    a.thinkT = this.rand() * 0.2;
    a.eye = { x: a.x, y: a.y };
    this.actors.push(a);
    return a;
  }

  byId(id) {
    return this.actors.find((a) => a.id === id) || null;
  }

  step(dt, input = {}) {
    this.acc += Math.min(dt, 0.1);
    let inp = this.withPending(input);
    if (this.acc < STEP) {
      this.keepEdges(inp);
      return;
    }
    while (this.acc >= STEP) {
      this.tick(inp);
      this.acc -= STEP;
      inp = edgeless(inp);
    }
  }

  // Note: a frame shorter than one tick runs no tick, so its key presses wait here for the next one.
  keepEdges(inp) {
    const kept = {};
    let any = false;
    for (const k of EDGE_KEYS) {
      if (inp[k]) {
        kept[k] = inp[k];
        any = true;
      }
    }
    this.pending = any ? kept : null;
  }

  withPending(input) {
    const p = this.pending;
    if (!p) return input;
    this.pending = null;
    const out = { ...input };
    for (const k of EDGE_KEYS) if (p[k]) out[k] = p[k];
    return out;
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // Note: Shift and Ctrl toggle a pace that stays until the same key is pressed again or the other one replaces it (item 10).
  applyPace(input) {
    const want = input.toggleSprint ? 'sprint' : input.toggleSlow ? 'slow' : null;
    if (want) this.setPace(this.pace === want ? 'walk' : want);
    return this.pace === 'walk' ? input : { ...input, [this.pace]: true };
  }

  setPace(pace) {
    this.pace = pace;
    this.events.push({ type: 'paceMode', actorId: this.sheriff.id, pace });
  }

  tick(input) {
    this.tickN++;
    this.time += STEP;
    input = this.applyPace(input);
    this.input = input;
    const s = this.sheriff;
    // Note: the sheriff's own map records what he has looked over, as a deputy's does.
    lookOver(this, s);
    if (input.crouch) this.prone = false;
    if (input.toggleProne && !input.crouch && s.status === 'ok' && !s.carried && !s.carrying && !s.action && !s.blasting && !s.elev && !isFlight(tileAt(this.map, s.floor, Math.floor(s.x), Math.floor(s.y))) && !this.outcome?.final) this.prone = !this.prone;
    if (input.toggleFarAim && s.status === 'ok' && !this.outcome?.final) this.farAim = !this.farAim;
    if (input.toggleSignal) {
      this.signal = !this.signal;
      this.events.push({ type: 'signalMode', actorId: s.id, signal: this.signal });
    }
    if (input.command && !this.outcome?.final) runCommand(this, input.command);
    if (s.carried && s.status === 'ok' && input.resist) this.releaseCarry(this.byId(s.carriedBy), 'resist');
    for (const a of this.actors) {
      let intent = IDLE;
      if (a.status === 'ok' && !a.withdrawn && !this.outcome?.final) {
        if (a === s) {
          intent = a.carried ? IDLE : this.playerIntent(s, input);
        } else {
          a.thinkT -= STEP;
          if (a.thinkT <= 0 || !a.intent) {
            a.intent = think(this, a);
            a.thinkT = (0.1 + this.rand() * 0.06) * (a.mods?.think ?? 1);
          }
          intent = this.clearFlight(a, this.withNav(a, a.intent || IDLE));
          if (intent.fire && intent.guard && this.muzzleBlocked(a, intent)) intent = { ...intent, fire: false };
          intent = dodgeBlast(this, a, intent);
        }
      }
      this.control(a, intent, STEP);
      this.stepFocus(a);
      if (a === s) this.stepAimView(a);
    }
    stepBlasting(this, input, STEP);
    this.stepBullets();
    this.stepWounds();
    this.stepDecals();
    this.checkOutcome();
  }

  // Note: an AI with no target and nothing to do on the flight walks on to the landing on its side, so no one idles in the single lane.
  clearFlight(a, intent) {
    // Note: a deputy who cannot walk is not moved off the flight (item 438).
    if (a.role === 'deputy' && !walks(capability(a))) return intent;
    const s = this.sheriff;
    const motion = this.input?.move;
    const fl = flightOf(this.map, a.floor, Math.floor(a.x), Math.floor(a.y));
    if (a.role === 'deputy' && fl && motion && Math.abs(motion.y) > 0.1 && Math.abs(a.x - s.x) < 0.8 && Math.abs(a.y - s.y) < 2.5 && (a.y - s.y) * motion.y > 0) {
      if (a.elev || isFlight(tileAt(this.map, a.floor, Math.floor(a.x), Math.floor(a.y)))) return { ...intent, goal: null, move: { x: 0, y: Math.sign(motion.y) }, mode: 'walk', fire: false };
      const side = [-1, 1].find((sign) => !this.blocked(a, a.x + sign * 0.6, a.y));
      if (side) return { ...intent, goal: null, move: { x: side, y: 0 }, mode: 'walk', fire: false };
      return { ...intent, goal: null, move: { x: 0, y: Math.sign(motion.y) }, mode: 'walk', fire: false };
    }
    if (!a.elev || intent.move || intent.fire || intent.targetId != null || a.action) return intent;
    if (!fl) return intent;
    const end = a.floor === fl.lo ? fl.foot : fl.head;
    const dx = end.x + 0.5 - a.x;
    const dy = end.y + 0.5 - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { ...intent, move: { x: dx / d, y: dy / d } };
  }

  // Note: an AI holds fire while an ally stands on the line the muzzle points along right now.
  muzzleBlocked(a, intent) {
    const t = intent.targetId ? this.byId(intent.targetId) : null;
    const range = (t ? dist(a, t) : intent.aimDist ?? 10) + 0.5;
    return muzzleBlocked(a, intent.guard, range);
  }

  playerIntent(a, input) {
    const m = input.move || { x: 0, y: 0 };
    const len = Math.hypot(m.x, m.y);
    const aim = input.aim || { x: a.x + Math.cos(a.facing) * 5, y: a.y + Math.sin(a.facing) * 5 };
    const intent = {
      move: len > 0 ? { x: m.x / len, y: m.y / len } : null,
      mode: input.slow ? 'slow' : input.sprint ? 'sprint' : 'walk',
      crouch: !!input.crouch,
      prone: this.prone,
      lean: input.lean || 0,
      face: Math.atan2(aim.y - a.eye.y, aim.x - a.eye.x),
      aimDist: clamp(Math.hypot(aim.x - a.eye.x, aim.y - a.eye.y), 2, 30),
      fire: !!input.fire,
      steady: !!input.steady,
      reload: !!input.reload,
      knife: !!input.knife,
      switchWeapon: !!input.switch,
      quiet: !!input.slow,
      useHeld: !!input.interactHeld,
      use: null,
    };
    intent.aimFloor = this.shownFloor(a, aim.x, aim.y);
    const under = this.aimTarget(a, aim, intent.aimFloor);
    if (under) intent.targetId = under.id;
    // Note: careful aim means right-click held while standing still; only the player ever sets it.
    intent.aimHigh = !!input.steady && !intent.move && a.mode === 'idle';
    if (input.interact || input.interactHeld) {
      // Note: item 492: a surrendering wanted man within reach, or aimed at in sight, takes the use key before doors and loot.
      intent.use = custodyUse(this, a, under) || this.findUse(a);
      if (intent.use) intent.use.edge = !!input.interact;
    }
    return blastIntent(this, a, input, intent);
  }

  // Note: the floor shown at a point: another floor inside a stairwell window, else the shooter's own.
  shownFloor(a, x, y) {
    if (this.follow() !== a || !this.shaft.rect) return a.floor;
    this.throughOf(a);
    const through = this.throughCache.list.find((p) => inPoly(p.cone, x, y));
    return through ? through.floor : a.floor;
  }

  // Note: the aim ray picks the nearest visible person it crosses, whatever the pointer distance.
  // Note: people on the aimed floor (or the flight) come first, and someone elsewhere only where his floor is the one shown.
  aimTarget(a, aim, floor) {
    return this.rayTarget(a, aim, (o) => o.floor === floor || !!o.elev) ||
      this.rayTarget(a, aim, (o) => this.shownFloor(a, o.x, o.y) === o.floor);
  }

  rayTarget(a, aim, eligible) {
    const vx = aim.x - a.eye.x, vy = aim.y - a.eye.y;
    const length = Math.hypot(vx, vy);
    if (!length) return null;
    const ux = vx / length, uy = vy / length;
    let best = null;
    let bd = Infinity;
    for (const o of this.actors) {
      if (o === a || o.status === 'dead' || o.withdrawn || !eligible(o)) continue;
      const candidates = [[o, RADIUS]];
      if (o.status === 'ok' && o.eye) candidates.push([o.eye, HEAD_R]);
      const d = Math.min(...candidates.map(([point, radius]) => {
        const dx = point.x - a.eye.x, dy = point.y - a.eye.y;
        const along = dx * ux + dy * uy;
        const side = Math.abs(dx * uy - dy * ux);
        return along > 0 && side <= radius ? along - Math.sqrt(radius * radius - side * side) : Infinity;
      }));
      if (d < bd && this.sees(a, o)) {
        best = o;
        bd = d;
      }
    }
    return best;
  }

  // Note: where a shot at this person lands; a downed person lies low, a head shot aims at the head band.
  aimHeight(t, high) {
    if (t.status !== 'ok') return LYING_H * (high ? 0.93 : 0.55);
    return (high ? HEAD_Z : CHEST_Z)[t.stance];
  }

  // Note: the aim point is an exposed one that the eye sees and a shot from the lower muzzle reaches, for every role.
  exposedAim(a, t, high) {
    if (!weaponOf(a) || !this.sees(a, t)) return null;
    const chest = this.aimHeight(t, false), head = this.aimHeight(t, true);
    const points = [];
    for (const z of high ? [head, chest] : [chest, head]) {
      const p = z === head && t.status === 'ok' ? t.eye : t;
      points.push({ x: p.x, y: p.y, z });
      const dx = t.x - a.eye.x, dy = t.y - a.eye.y, d = Math.hypot(dx, dy) || 1;
      // Note: a head point stays inside the head circle, so the shot it names can hit.
      const off = z === head ? HEAD_R * 0.7 : SIDE_AIM;
      for (const side of [-1, 1]) points.push({ x: p.x - dy / d * side * off, y: p.y + dx / d * side * off, z });
    }
    // Note: the rest of the body the eye samples comes last, so a target seen only by the legs is shot in the legs.
    if (t.status === 'ok') for (const z of BODY_Z) if (z <= HEIGHT[t.stance] && z !== chest && z !== head) points.push({ x: t.x, y: t.y, z });
    const zo = absZ(a.floor, a.elev || 0, EYE_Z[a.stance]);
    const fov = this.fovOf(a);
    return points.find((p) => canSeePoint3(this.map, this.shaft, a.eye, zo, a.facing, fov, p.x, p.y, absZ(t.floor, t.elev || 0, p.z)) &&
      clearShotToActor(this.map, this.shaft, a, t, p)) || null;
  }

  // Note: a door or window ahead wins over a body unless the body lies nearer, in front, and has something to take.
  findUse(a) {
    let ahead = null;
    let reach = 0;
    for (const r of [0.7, 1.1]) {
      const ix = Math.floor(a.x + Math.cos(a.facing) * r);
      const iy = Math.floor(a.y + Math.sin(a.facing) * r);
      const t = tileAt(this.map, a.floor, ix, iy);
      if (t === T.DOOR) ahead = { type: 'door', x: ix, y: iy };
      else if (t === T.WINDOW) ahead = { type: 'window', x: ix, y: iy };
      if (ahead) {
        reach = r;
        break;
      }
    }
    // Note: loot counts only within reach, and with a door ahead only when nearer than it and in front.
    const inFront = (x, y) => {
      const d = Math.hypot(x - a.x, y - a.y);
      if (d >= 1.1) return false;
      if (!ahead) return true;
      return d < reach && (d < 0.4 || Math.abs(angleDiff(a.facing, Math.atan2(y - a.y, x - a.x))) < 0.9);
    };
    const body = this.actors.find((b) => b !== a && b.status !== 'ok' && !b.carried && b.floor === a.floor && this.hasLoot(b, a) && inFront(b.x, b.y));
    if (body) return { type: 'scavenge', id: body.id };
    const item = this.items.find((it) => it.floor === a.floor && !a.elev && itemUseful(a, it) && inFront(it.x, it.y));
    return item ? { type: 'scavenge', itemId: item.id } : ahead;
  }

  // Note: loot is rounds, or a weapon that adds a slot for the looter; a gun left behind after a pass is not loot.
  hasLoot(b, a) {
    if (Object.values(b.ammo).some((n) => n > 0) || b.weapons.some((w) => w.loaded > 0)) return true;
    if (!a) return b.weapons.length > 0;
    return b.weapons.some((w) => canCarry(a, w));
  }

  // Note: AI intents carry a goal; navigation turns it into a move direction and door or window actions.
  withNav(a, intent) {
    if (!intent.goal) {
      a.nav = null;
      return intent;
    }
    const goal = intent.goal;
    const ai = a.ai;
    const same = (p) => p && p.f === goal.f && Math.hypot(p.x - goal.x, p.y - goal.y) < 0.8;
    if (same(ai.abandonedGoal) && this.time < ai.abandonedGoal.until) return { ...intent, goal: null, move: null };
    const r = this.navigate(a, goal, intent);
    const progress = ai.goalProgress;
    if (!same(progress) || Math.hypot(a.x - progress.atX, a.y - progress.atY) > 0.2 || a.action) {
      ai.goalProgress = { ...goal, atX: a.x, atY: a.y, t: this.time };
    } else if (a.navState !== 'arrived' && this.time - progress.t > 3) {
      ai.abandonedGoal = { ...goal, until: this.time + 8 };
      ai.goalProgress = null;
      a.nav = null;
      if (ai.holdSpot && same(ai.holdSpot)) ai.holdSpot = null;
      if (ai.order?.spot && same(ai.order.spot)) { ai.order.spot = null; ai.order.sweep = null; ai.order.arrivedAt = null; }
      if (a.role === 'civilian') ai.mode = 'hide';
      return { ...intent, goal: null, move: null, fire: false };
    }
    return { ...intent, move: r.move, use: intent.use || r.use, useHeld: intent.useHeld || r.useHeld };
  }

  navigate(a, goal, intent) {
    const force = a === this.sheriff && !!goal.force;
    const gk = goalKey(goal);
    let n = a.nav;
    if (!n || n.gk !== gk || !n.path || this.time >= n.replanAt) {
      // Note: actors do not move during a path search, so each cell's occupancy is cached for the whole search.
      const W = this.map.W;
      const H = this.map.H;
      const occupancy = new Int8Array(W * H * this.map.floors.length);
      const path = findPath(this.map, { x: a.x, y: a.y, f: a.floor }, { x: goal.x, y: goal.y, f: goal.f }, {
        force,
        windows: goal.windows !== false,
        avoid: (x, y, f) => {
          const k = (f * H + y) * W + x;
          if (!occupancy[k]) occupancy[k] = this.occupied(x, y, f, a, goal) ? 2 : 1;
          return occupancy[k] === 2;
        },
      });
      n = a.nav = { gk, path, replanAt: this.time + 0.8 + this.rand() * 0.4, lastX: a.x, lastY: a.y, lastT: this.time };
    }
    if (!n.path) {
      a.navState = 'blocked';
      return { move: null };
    }
    const p = n.path;
    // Note: a flight waypoint keeps its floor until the actor flips on the stairs; the one before the flight is met closely so the actor enters centred.
    while (p.length && p[0].f !== a.floor && p[0].kind !== 'stairs') p.shift();
    while (p.length && (p[0].kind === 'walk' || p[0].kind === 'stairs') && Math.hypot(p[0].x - a.x, p[0].y - a.y) < (p[1]?.kind === 'stairs' ? 0.12 : p.length === 1 ? Math.min(goal.r ?? 0.35, 0.35) : 0.35)) p.shift();
    const stop = goal.r ?? 0.45;
    const gap = Math.hypot(goal.x - a.x, goal.y - a.y);
    if (!p.length && a.floor === goal.f && Math.floor(a.x) === Math.floor(goal.x) && Math.floor(a.y) === Math.floor(goal.y) && gap >= stop) {
      a.navState = 'moving';
      return { move: { x: (goal.x - a.x) / gap, y: (goal.y - a.y) / gap } };
    }
    if (!p.length || (a.floor === goal.f && Math.hypot(goal.x - a.x, goal.y - a.y) < stop)) {
      a.navState = 'arrived';
      return { move: null };
    }
    a.navState = 'moving';
    if (this.time - n.lastT > 1) {
      if (Math.hypot(a.x - n.lastX, a.y - n.lastY) < 0.12 && !a.action) n.replanAt = 0;
      n.lastX = a.x;
      n.lastY = a.y;
      n.lastT = this.time;
    }
    const wp = p[0];
    const dx = wp.x - a.x;
    const dy = wp.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    if (wp.kind === 'door' || wp.kind === 'window') {
      const wx = Math.floor(wp.x);
      const wy = Math.floor(wp.y);
      const st = stateAt(this.map, a.floor, wx, wy);
      const closed = wp.kind === 'door' ? st === DS.CLOSED || st === DS.LOCKED : true;
      if (closed && d < 1.15) {
        const forcing = wp.kind === 'door' ? st === DS.LOCKED : st === WS.BOLTED;
        if (forcing && a !== this.sheriff) { a.nav = null; a.navState = 'blocked'; return { move: null }; }
        return { move: d > 0.95 ? { x: dx / d, y: dy / d } : null, use: { type: wp.kind, x: wx, y: wy, edge: true }, useHeld: forcing, quiet: !!intent.quiet };
      }
    }
    return { move: { x: dx / d, y: dy / d } };
  }

  occupied(x, y, f, self, goal) {
    if (goal && f === goal.f && Math.floor(goal.x) === x && Math.floor(goal.y) === y) return false;
    return this.actors.some((b) => b !== self && b.status === 'ok' && !b.withdrawn && b.floor === f && !b.carried && Math.floor(b.x) === x && Math.floor(b.y) === y && b.ai?.state !== 'moving');
  }

  control(a, intent, dt) {
    a.disturb = Math.max(0, a.disturb - dt);
    if (a.react && this.time >= a.react.t0 + a.react.dur) a.react = null;
    if (a.status === 'ok') for (const w of a.weapons) tickWeapon(w, dt);
    if (a.status !== 'ok') {
      a.mode = 'idle';
      a.steady = false;
      a.crouchK = 0;
      this.dropFromFlight(a);
      this.updateEye(a);
      return;
    }
    if (a.carried) {
      const c = this.byId(a.carriedBy);
      if (c) {
        a.x = c.x;
        a.y = c.y;
        a.floor = c.floor;
        a.elev = c.elev;
      }
      a.mode = 'idle';
      this.updateEye(a);
      return;
    }
    const cap = capability(a);
    if (a.react) intent = this.reeling(a, intent, dt);
    a.stance = intent.prone && !a.carrying ? 'prone' : intent.crouch ? 'crouch' : 'stand';
    a.lean = a.elev || a.stance === 'prone' ? 0 : intent.lean || 0;
    a.steady = !!intent.steady && cap.canAct;
    this.turn(a, intent, dt);
    this.moveActor(a, intent, cap, dt);
    if (a.stance === 'prone' && (a.elev || isFlight(tileAt(this.map, a.floor, Math.floor(a.x), Math.floor(a.y))))) {
      a.stance = 'stand';
      if (a === this.sheriff) this.prone = false;
    }
    this.updateEye(a);
    if (a.carrying) this.carryAlong(a);
    if (a.action) this.progressAction(a, intent, dt);
    else if (intent.knife && a === this.sheriff) this.beginKnife(a);
    else if (intent.use) this.beginUse(a, intent.use, intent);
    this.updateSettle(a, dt);
    if (cap.canAct) this.handleWeapon(a, intent, cap);
  }

  // Note: the carried one is set down where the carrier now stands, on the flight too.
  carryAlong(c) {
    const s = this.byId(c.carrying);
    if (!s) return;
    s.x = c.x;
    s.y = c.y;
    s.floor = c.floor;
    s.elev = c.elev;
  }

  // Note: the centimetre-scale impulse is wall checked; the longer pose is the body's own response.
  reeling(a, intent, dt) {
    const r = a.react;
    if (r.push > 0.001 && !a.carried) {
      const step = Math.min(r.push, PUSH_SPEED * dt);
      this.moveBy(a, Math.cos(r.dir) * step, Math.sin(r.dir) * step);
      r.push -= step;
    }
    if (a === this.sheriff || this.time >= r.t0 + r.freeze) return intent;
    return { ...intent, move: null, fire: false, use: null, reload: false, switchWeapon: false, switchTo: undefined };
  }

  turn(a, intent, dt) {
    let want = a.facing;
    const t = intent.targetId ? this.byId(intent.targetId) : null;
    if (intent.face !== undefined) want = intent.face;
    else if (intent.targetId) {
      if (t) want = Math.atan2(t.y - a.eye.y, t.x - a.eye.x);
    } else if (intent.aimAt) want = Math.atan2(intent.aimAt.y - a.eye.y, intent.aimAt.x - a.eye.x);
    else if (intent.move) want = Math.atan2(intent.move.y, intent.move.x);
    if (t && acrossFloor(a, t)) {
      const center = Math.atan2(t.y - a.eye.y, t.x - a.eye.x);
      const tolerance = Math.atan2(0.9, Math.hypot(t.x - a.eye.x, t.y - a.eye.y));
      if (Math.abs(angleDiff(want, center)) <= tolerance) {
        const p = this.exposedAim(a, t, intent.aimHigh);
        if (p) want = Math.atan2(p.y - a.eye.y, p.x - a.eye.x);
      }
    }
    const rate = (TURN[a.role] || 5) * (a.role === 'hostile' ? EXP_TURN[a.traits.experience] : 1) * (a.react ? a.react.turn : 1);
    const d = angleDiff(a.facing, want);
    a.facing += clamp(d, -rate * dt, rate * dt);
  }

  moveActor(a, intent, cap, dt) {
    a.moveDesired = intent.move || null;
    const lock = a.action && LOCKS.has(a.action.type);
    if (lock || !intent.move || !cap.canMove) {
      a.mode = 'idle';
      a.moveHeading = null;
      return;
    }
    let mode = intent.mode || 'walk';
    if (a.stance === 'prone') mode = 'walk';
    if (mode === 'sprint' && (a.stance === 'crouch' || a.lean || cap.mobility < 0.6 || a.carrying || a.react || a.elev)) mode = 'walk';
    let speed = SPEED[mode] * (a.stance === 'prone' ? PRONE_MUL : a.stance === 'crouch' ? CROUCH_MUL : 1) * (a.lean ? LEAN_MUL : 1) * cap.mobility * (a.react ? a.react.speed : 1);
    if (a.action && SLOW.has(a.action.type)) speed *= 0.6;
    if (a.elev) speed *= STAIR_SPEED;
    // Note: item 485: a climb on outdoor relief slows the pace and a gentle descent quickens it a little.
    if (this.map.relief) speed *= slopeSpeed(this.map, a.x, a.y, intent.move.x, intent.move.y);
    if (a.carrying) speed *= 0.55;
    speed *= a.mods?.speed ?? 1;
    const moved = this.moveBy(a, intent.move.x * speed * dt, intent.move.y * speed * dt);
    a.mode = moved > 0.0005 ? mode : 'idle';
    a.moveHeading = a.mode === 'idle' ? null : { x: intent.move.x, y: intent.move.y };
    if (a.mode === 'idle') return;
    a.stepD += moved;
    const stride = mode === 'sprint' ? 1.5 : mode === 'slow' ? 0.5 : 0.9;
    if (a.stepD >= stride) {
      a.stepD = 0;
      this.emit(a, mode === 'slow' ? 'slow' : (a.stance === 'crouch' || a.stance === 'prone') && mode !== 'sprint' ? 'crouch' : mode === 'walk' ? 'walk' : mode);
    }
  }

  moveBy(a, dx, dy) {
    const x0 = a.x;
    const y0 = a.y;
    if (dx && !this.blocked(a, a.x + dx, a.y)) a.x += dx;
    if (dy && !this.blocked(a, a.x, a.y + dy)) a.y += dy;
    this.settleFlight(a);
    return Math.hypot(a.x - x0, a.y - y0);
  }

  // Note: on the flight, height follows position: z climbs one storey over its two metres from its lower floor and the floor flips when the eye passes the slab.
  settleFlight(a) {
    const cx = Math.floor(a.x);
    const cy = Math.floor(a.y);
    const fl = isFlight(tileAt(this.map, a.floor, cx, cy)) ? flightOf(this.map, a.floor, cx, cy) : null;
    if (!fl) {
      a.elev = 0;
      return;
    }
    const z = (FLOOR_H * (fl.sy + 1 - a.y)) / 2;
    a.floor = z >= FLIP_Z ? fl.hi : fl.lo;
    a.elev = z - (a.floor - fl.lo) * FLOOR_H;
  }

  // Note: someone put down on the flight ends lying at its foot on its lower floor.
  dropFromFlight(a) {
    if (!a.elev) return;
    const fl = flightOf(this.map, a.floor, Math.floor(a.x), Math.floor(a.y));
    if (!fl) {
      a.elev = 0;
      return;
    }
    a.x = fl.foot.x + 0.5;
    a.y = fl.foot.y + 0.5;
    a.floor = fl.lo;
    a.elev = 0;
    a.nav = null;
    this.updateEye(a);
  }

  blocked(a, x, y) {
    for (let cy = Math.floor(y - RADIUS); cy <= Math.floor(y + RADIUS); cy++) {
      for (let cx = Math.floor(x - RADIUS); cx <= Math.floor(x + RADIUS); cx++) {
        if (!solidAt(this.map, a.floor, cx, cy)) continue;
        // Note: a rail blocks only its thin strip, every other solid cell blocks whole.
        const rail = tileAt(this.map, a.floor, cx, cy) === T.RAIL ? railStrip(this.map, a.floor, cx, cy) : null;
        const nx = rail ? clamp(x, rail.x0, rail.x1) : clamp(x, cx, cx + 1);
        const ny = rail ? clamp(y, rail.y0, rail.y1) : clamp(y, cy, cy + 1);
        if (Math.hypot(x - nx, y - ny) < RADIUS) return true;
      }
    }
    for (const b of this.actors) {
      if (b === a || b.status !== 'ok' || b.withdrawn || b.carried || a.carried || b.id === a.carrying || a.id === b.carrying) continue;
      if (Math.abs(a.floor * FLOOR_H + a.elev - (b.floor * FLOOR_H + b.elev)) > 1.2) continue;
      const nd = Math.hypot(b.x - x, b.y - y);
      if (nd < 0.55 && nd <= Math.hypot(b.x - a.x, b.y - a.y)) return true;
    }
    return false;
  }

  updateEye(a) {
    a.eye = eyePosition(this.map, a.floor, a, a.facing, a.lean);
  }

  updateSettle(a, dt) {
    const w = weaponOf(a);
    if (w) stepSettle(a, w, dt, { steady: a.steady, mode: a.mode });
  }

  handleWeapon(a, intent, cap) {
    if (intent.switchWeapon || intent.switchTo !== undefined) this.startSwitch(a, intent.switchTo);
    if (intent.clearMisfire && !a.action) {
      const w = weaponOf(a);
      if (w?.fault && usable(cap, w)) a.action = { type: 'clearMisfire', t: 0, dur: w.fault, weapon: w };
    }
    if (intent.reload) this.startReload(a);
    if (intent.fire) this.tryFire(a, intent);
  }

  startSwitch(a, to) {
    if (a.action || a.weapons.length < 2) return;
    const idx = to ?? (a.cur + 1) % a.weapons.length;
    if (idx === a.cur || !a.weapons[idx]) return;
    // Note: a weapon the wounded arms cannot handle is not drawn (item 95).
    if (!usable(capability(a), a.weapons[idx])) return;
    a.action = { type: 'switch', t: 0, dur: WEAPONS[a.weapons[idx].id].drawTime / (a.mods?.handling ?? 1), to: idx };
    this.events.push({ type: 'switch', actorId: a.id, stage: 'start' });
    this.emit(a, 'switch');
  }

  startReload(a) {
    const w = weaponOf(a);
    if (!w || w.fault || a.action) return false;
    // Note: no reload of a weapon the wounded arms cannot handle (item 95).
    if (!usable(capability(a), w)) return false;
    const state = beginReload(a, w);
    if (!state) return false;
    a.action = { type: 'reload', t: 0, dur: Infinity, state };
    this.events.push({ type: 'reload', actorId: a.id, stage: 'start' });
    return true;
  }

  stepReloadAction(a, act, dt) {
    const w = weaponOf(a);
    if (!w) {
      a.action = null;
      return;
    }
    const r = stepReload(a, w, act.state, (capability(a).oneArm ? dt * ONE_ARM_RELOAD : dt) * (a.mods?.handling ?? 1));
    for (const stage of r.stages) {
      this.emit(a, 'reload');
      this.events.push({ type: 'reload', actorId: a.id, actorRole: a.role, stage });
    }
    if (r.done) {
      a.action = null;
      this.events.push({ type: 'reload', actorId: a.id, stage: 'done' });
    }
  }

  tryFire(a, intent) {
    const w = weaponOf(a);
    if (!w || (w.cool || 0) > 0) return false;
    if (a.react && this.time < a.react.t0 + a.react.noFire) return false;
    if (a.action) {
      if (a.action.type === 'reload' && canFireWhileReloading(w)) {
        cancelReload(a.action.state);
        a.action = null;
      } else return false;
    }
    let z;
    let aimDist = intent.aimDist ?? 10;
    if (intent.targetId) {
      const t = this.byId(intent.targetId);
      if (t) {
        const candidate = acrossFloor(a, t) || this.map.relief ? this.exposedAim(a, t, intent.aimHigh) : null;
        const p = candidate && clearShotToActor(this.map, this.shaft, a, t, candidate, a.facing) ? candidate : null;
        aimDist = p ? (p.x - a.eye.x) * Math.cos(a.facing) + (p.y - a.eye.y) * Math.sin(a.facing) : Math.hypot(t.x - a.eye.x, t.y - a.eye.y);
        // Note: a target on the other floor or on the flight is higher or lower by whole storeys and the climb.
        z = (p?.z ?? this.aimHeight(t, intent.aimHigh)) + (t.floor - a.floor) * FLOOR_H + (t.elev || 0) - (a.elev || 0) + this.noise(a) * this.aimZSpread(a);
        // Note: item 485: on relief the target stands higher or lower by the lie of the ground.
        if (this.map.relief) z += groundOf(this.map, t) - groundOf(this.map, a);
      }
    }
    // Note: item 485: a shot at open ground on relief goes to body height over the ground where it is aimed.
    if (z === undefined && this.map.relief) z = (intent.aimHigh ? HEAD_Z : CHEST_Z).stand + groundAt(this.map, a.eye.x + Math.cos(a.facing) * aimDist, a.eye.y + Math.sin(a.facing) * aimDist) - groundOf(this.map, a);
    // Note: with no one aimed at, the shot goes to body height on the aimed floor, measured from the shooter's place on the flight.
    const aimFloor = intent.aimFloor ?? a.floor;
    if (z === undefined && (intent.aimHigh || a.elev || aimFloor !== a.floor)) z = (intent.aimHigh ? HEAD_Z : CHEST_Z).stand + (aimFloor - a.floor) * FLOOR_H - (a.elev || 0);
    const r = fireWeapon(a, w, { angle: a.facing, dist: aimDist, z, manualMisfire: a.role !== 'sheriff' }, this.rand);
    // Note: item 465: Precision quickens working the lever, bolt or hammer between shots.
    if (r.ok && a.mods?.handling) w.cool /= a.mods.handling;
    if (!r.ok) {
      if (r.reason === 'empty') {
        w.cool = 0.35;
        this.events.push({ type: 'click', actorId: a.id });
        this.emit(a, 'cycle');
      }
      // Note: item 369: a dead round clicks and is worked out of the gun.
      if (r.reason === 'misfire') {
        a.tally.fired[w.ammoType] = (a.tally.fired[w.ammoType] || 0) + 1;
        this.events.push({ type: 'misfire', actorId: a.id });
        this.emit(a, 'cycle');
      }
      return false;
    }
    for (const b of r.bullets) {
      if (a.elev) b.z += a.elev;
      if (this.map.relief) b.z += groundOf(this.map, a);
      this.bullets.push(b);
    }
    a.tally.fired[w.ammoType] = (a.tally.fired[w.ammoType] || 0) + 1;
    a.lastFiredAt = this.time;
    a.disturb = Math.max(a.disturb, 0.4);
    this.events.push({ type: 'shot', actorId: a.id, x: a.eye.x, y: a.eye.y, floor: a.floor, weaponId: w.id });
    this.emit(a, r.noise);
    return true;
  }

  noise(a) {
    const u = Math.max(this.rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
  }

  aimZSpread(a) {
    const base = a.role === 'hostile' ? { green: 0.25, seasoned: 0.15, veteran: 0.08 }[a.traits.experience] : 0.08;
    return base * proneAimFactor(a);
  }

  // Note: the stab runs at chest height like a bullet, so walls, shut doors, shut glass and tall furniture stop it.
  knifeLine(a, h) {
    if (!castRay(this.map, a.floor, a.x, a.y, h.x, h.y).clear) return false;
    const dx = h.x - a.x, dy = h.y - a.y, d = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(d / 0.05));
    for (let i = 0; i <= n; i++) {
      const cx = Math.floor(a.x + dx * i / n), cy = Math.floor(a.y + dy * i / n);
      if (cellObstacle(tileAt(this.map, a.floor, cx, cy), stateAt(this.map, a.floor, cx, cy), KNIFE_Z)) return false;
    }
    return !this.actors.some((o) => {
      if (o === a || o === h || o.status !== 'ok' || o.carried || o.floor !== a.floor) return false;
      const along = ((o.x - a.x) * dx + (o.y - a.y) * dy) / (d * d);
      return along > 0.1 && along < 0.9 && Math.abs((o.x - a.x) * dy - (o.y - a.y) * dx) / d < KNIFE_BODY;
    });
  }

  // Note: commit judges the positioning once; completion re-checks only reach and obstruction.
  knifeWhy(a, h, commit) {
    if (!h || h.role !== 'hostile' || h.status !== 'ok') return 'target';
    if (h.floor !== a.floor || Math.abs((h.elev || 0) - (a.elev || 0)) > 0.6) return 'range';
    const dx = h.x - a.x, dy = h.y - a.y, d = Math.hypot(dx, dy);
    if (d > KNIFE_REACH || (commit && d < 0.05)) return 'range';
    if (commit) {
      if (Math.abs(angleDiff(a.facing, Math.atan2(dy, dx))) > KNIFE_ARC) return 'aim';
      if (Math.abs(angleDiff(h.facing, Math.atan2(-dy, -dx))) < KNIFE_ARC) return 'front';
    }
    return this.knifeLine(a, h) ? null : 'blocked';
  }

  beginKnife(a) {
    if (a.action || a.carried || a.carrying || a.stance === 'prone' || !capability(a).handgunOk) return false;
    const near = [...this.hostiles].sort((p, q) => dist(a, p) - dist(a, q));
    let target = null;
    let refused = null;
    for (const h of near) {
      const why = this.knifeWhy(a, h, true);
      if (!why) {
        target = h;
        break;
      }
      if (!refused && why !== 'target' && why !== 'range') refused = why;
    }
    if (!target) {
      if (refused) this.knifeNote(a, 'reject', refused, null);
      return false;
    }
    a.action = { type: 'knife', t: 0, dur: KNIFE_TIME, id: target.id };
    this.events.push({ type: 'knife', actorId: a.id, targetId: target.id, stage: 'start' });
    this.emit(a, 'swish');
    return true;
  }

  // Note: a refused or cancelled stab always gives an event and a short line.
  knifeNote(a, stage, reason, target) {
    this.events.push({ type: 'knife', actorId: a.id, targetId: target ? target.id : null, stage, reason });
    this.voice(a, KNIFE_WORDS[reason]);
  }

  // Note: a target that leaves reach or a person who steps in cancels the stab at once.
  knifeCheck(a, act) {
    const why = this.knifeWhy(a, this.byId(act.id), false);
    if (!why) return true;
    a.action = null;
    this.knifeNote(a, 'cancel', why, this.byId(act.id));
    return false;
  }

  // Note: a stab needs a body that is not prone and a working hand.
  knifeBar(a) {
    if (a.stance === 'prone') return 'prone';
    return capability(a).handgunOk ? null : 'arm';
  }

  finishKnife(a, act) {
    const victim = this.byId(act.id);
    const why = this.knifeBar(a) || this.knifeWhy(a, victim, false);
    if (why) return this.knifeNote(a, 'cancel', why, victim);
    // HACK: the shared wound lifecycle takes a zero roll, and 700 J on the head always kills.
    const result = applyHit(victim, { region: 'head', side: 0 }, 700, () => 0, this.time);
    victim.cause = 'knife wound';
    victim.lastHitBy = a.role;
    this.decals.push({ x: victim.x, y: victim.y, floor: victim.floor, r: 0.25, age: this.time });
    this.events.push({ type: 'hit', actorId: victim.id, ownerId: a.id, region: 'head', side: 0, died: true, incapacitated: false, fatal: true, x: victim.x, y: victim.y, floor: victim.floor, dir: a.facing, severity: result.wound.severity, kind: 'snap' });
    this.events.push({ type: 'knife', actorId: a.id, targetId: victim.id, stage: 'done' });
    this.emit(a, 'knife');
    this.onStatus(victim);
  }

  beginUse(a, use, intent) {
    if (a.carried || a.elev || a.stance === 'prone') return;
    // Note: a carrier has one free hand, enough for a closed door but not for forcing, climbing or looting.
    if (a.carrying && !(use.type === 'door' && stateAt(this.map, a.floor, use.x, use.y) === DS.CLOSED)) return;
    const x = use.x;
    const y = use.y;
    const held = use.edge || intent.useHeld;
    let act = null;
    if (use.type === 'door') {
      const st = stateAt(this.map, a.floor, x, y);
      if (!use.edge && st !== DS.LOCKED) return;
      if (st === DS.CLOSED) act = intent.quiet ? { op: 'open', dur: 1.4, quiet: true } : { op: 'open', dur: 0.45 };
      else if (st === DS.LOCKED && held) act = { op: 'force', dur: 1.6 + this.rand() * 1.4, needHeld: true, thud: 0.5 };
      else if (st === DS.OPEN) act = { op: 'close', dur: 0.5, quiet: true };
    } else if (use.type === 'window') {
      const st = stateAt(this.map, a.floor, x, y);
      if (!use.edge && st !== WS.BOLTED) return;
      if (st === WS.CLOSED) act = { op: 'open', dur: 0.8 };
      else if (st === WS.BOLTED && held) act = { op: 'force', dur: 2.5, needHeld: true, thud: 0.6 };
      else if (st === WS.OPEN || st === WS.BROKEN) {
        const dest = this.crossTarget(a, x, y);
        if (dest) act = { op: 'climb', dur: st === WS.OPEN ? 1.8 : 2.2, dest };
      }
    } else if (use.type === 'custody') {
      // Note: item 492: one press accepts the surrender; within reach a press starts tying his hands, which takes time.
      const v = this.byId(use.id);
      if (!use.edge || !v) return;
      if (!v.accepted) acceptSurrender(this, a, v);
      if (v.accepted && dist(a, v) < SECURE_REACH) act = { dur: SECURE_TIME, id: v.id };
    } else if (use.type === 'scavenge' && use.itemId !== undefined) {
      const it = this.items.find((x) => x.id === use.itemId);
      if (use.edge && it && it.floor === a.floor && Math.hypot(it.x - a.x, it.y - a.y) < ITEM_REACH + 0.3) act = { dur: ITEM_TIME, itemId: it.id };
    } else if (use.type === 'scavenge') {
      const b = this.byId(use.id);
      if (use.edge && b && b.status !== 'ok' && dist(a, b) < 1.4) act = { dur: 2, id: b.id };
    }
    if (!act) return;
    a.action = { type: use.type, t: 0, x, y, ...act };
    if (use.type === 'door' || use.type === 'window') {
      if (act.op === 'open' || act.op === 'close') this.emit(a, act.quiet ? 'door_quiet' : use.type === 'door' ? 'door' : 'window_open');
      else if (act.op === 'climb') this.emit(a, 'climb');
    } else if (use.type === 'scavenge') this.emit(a, 'scavenge');
    this.events.push({ type: use.type, actorId: a.id, stage: 'start', op: act.op });
  }

  // Note: the far side of a window along the axis that crosses the wall.
  crossTarget(a, wx, wy) {
    const vertical = solidAt(this.map, a.floor, wx - 1, wy) && solidAt(this.map, a.floor, wx + 1, wy);
    const sgn = vertical ? Math.sign(a.y - (wy + 0.5)) || 1 : Math.sign(a.x - (wx + 0.5)) || 1;
    const dx = vertical ? 0 : -sgn;
    const dy = vertical ? -sgn : 0;
    const tx = wx + dx;
    const ty = wy + dy;
    if (solidAt(this.map, a.floor, tx, ty)) return null;
    return { x: tx + 0.5, y: ty + 0.5 };
  }

  progressAction(a, intent, dt) {
    const act = a.action;
    act.t += dt;
    if (act.type === 'clearMisfire') {
      if (!usable(capability(a), act.weapon)) { a.action = null; return; }
      act.weapon.fault = Math.max(0, act.weapon.fault - dt);
      if (!act.weapon.fault) a.action = null;
      return;
    }
    if (act.type === 'reload') {
      this.stepReloadAction(a, act, dt);
      return;
    }
    if (act.type === 'knife' && !this.knifeCheck(a, act)) return;
    if (act.needHeld && !intent.useHeld) {
      a.action = null;
      return;
    }
    if (act.needHeld) {
      act.thud -= dt;
      if (act.thud <= 0) {
        this.emit(a, 'impact', 58);
        act.thud = 0.9;
      }
    }
    if (act.type === 'pickup') {
      const s = this.byId(act.id);
      if (!s || dist(a, s) > 1.6) a.action = null;
      else if (s.status === 'ok' && this.input.resist) {
        a.action = null;
        a.ai.carryCooldown = this.time + 8;
      }
    }
    if (act.type === 'custody') {
      const v = this.byId(act.id);
      if (!v || v.status !== 'ok' || dist(a, v) > SECURE_BREAK) a.action = null;
    }
    if (a.action && act.t >= act.dur) this.completeAction(a, act);
  }

  completeAction(a, act) {
    const f = a.floor;
    a.action = null;
    switch (act.type) {
      case 'knife':
        this.finishKnife(a, act);
        break;
      case 'custody':
        secureTarget(this, a, this.byId(act.id));
        break;
      case 'door': {
        const next = act.op === 'open' ? DS.OPEN : act.op === 'close' ? DS.CLOSED : DS.BROKEN;
        setState(this.map, f, act.x, act.y, next);
        if (act.op === 'force') this.emit(a, 'door_force');
        this.events.push({ type: 'tile', f, x: act.x, y: act.y });
        this.events.push({ type: 'door', actorId: a.id, stage: 'done', op: act.op });
        break;
      }
      case 'window': {
        if (act.op === 'open') setState(this.map, f, act.x, act.y, WS.OPEN);
        else if (act.op === 'force') {
          setState(this.map, f, act.x, act.y, WS.BROKEN);
          this.emit(a, 'window_break');
        } else if (act.op === 'climb') {
          a.x = act.dest.x;
          a.y = act.dest.y;
          a.nav = null;
        }
        this.events.push({ type: 'tile', f, x: act.x, y: act.y });
        this.events.push({ type: 'window', actorId: a.id, stage: 'done', op: act.op });
        break;
      }
      case 'scavenge': {
        if (act.itemId !== undefined) this.takeItem(a, act.itemId);
        else {
          const b = this.byId(act.id);
          if (b) this.scavenge(a, b);
        }
        this.events.push({ type: 'scavenge', actorId: a.id, stage: 'done' });
        break;
      }
      case 'switch':
        a.cur = act.to;
        disruptAim(a, 0);
        this.events.push({ type: 'switch', actorId: a.id, stage: 'done' });
        break;
      case 'pickup':
        this.completeCarry(a, this.byId(act.id));
        break;
      default:
    }
  }

  // Note: ammunition of any kind is taken; a weapon is taken only when it adds a slot.
  scavenge(a, b) {
    for (const w of b.weapons) {
      b.ammo[w.ammoType] += w.loaded;
      w.loaded = 0;
    }
    // Note: item 367: a gun is taken only into a free slot, counted again after each one taken.
    b.weapons = b.weapons.filter((w) => {
      if (canCarry(a, w)) {
        a.weapons.push(w);
        return false;
      }
      return true;
    });
    for (const k of Object.keys(b.ammo)) {
      a.ammo[k] = (a.ammo[k] || 0) + b.ammo[k];
      if (b.ammo[k]) a.tally.looted[k] = (a.tally.looted[k] || 0) + b.ammo[k];
      b.ammo[k] = 0;
    }
  }

  // Note: an arm hit may make the actor let go of the weapon in hand; the roll is a hash, so the combat stream is untouched.
  armHit(v, e) {
    const w = weaponOf(v);
    if (!w) return;
    // Note: the roll is a hash of the seed, the actor, the wound and the tick, so it varies between plays and leaves sim.rand alone.
    const fx = armHitEffect(v, w, e, unit(`${this.seed}:armdrop:${v.id}:${v.wounds.length}:${Math.round(this.time / STEP)}`));
    if (fx.drop) this.dropWeapon(v, v.cur, fx.reason);
    this.drawUsable(v, fx.drop);
  }

  // Note: the weapon leaves the hand and lands on the floor a short way off; anyone can pick it up.
  dropWeapon(a, idx, reason = 'hit') {
    const w = a.weapons[idx];
    if (!w) return null;
    if (a.action && (a.action.type === 'reload' || a.action.type === 'switch')) {
      if (a.action.type === 'reload') cancelReload(a.action.state);
      a.action = null;
    }
    const wasCur = idx === a.cur;
    a.weapons.splice(idx, 1);
    if (idx < a.cur) a.cur--;
    else if (wasCur) a.cur = 0;
    a.cur = Math.min(a.cur, Math.max(0, a.weapons.length - 1));
    disruptAim(a, 0);
    const spot = dropSpot(this.seed, a, this.nextItem);
    const item = {
      id: this.nextItem++, weapon: w, x: spot.x, y: spot.y, floor: a.floor,
      from: { x: a.x + Math.cos(a.facing) * 0.35, y: a.y + Math.sin(a.facing) * 0.35 }, t: this.time, by: a.id,
    };
    this.items.push(item);
    this.events.push({ type: 'drop', actorId: a.id, itemId: item.id, weaponId: w.id, reason, x: spot.x, y: spot.y, floor: a.floor });
    this.emit({ x: spot.x, y: spot.y, floor: a.floor, id: -1 }, 'drop');
    return item;
  }

  // Note: after a drop, or with a carbine the arms cannot hold, the actor draws a weapon it can fire; one arm makes the draw slower.
  drawUsable(a, dropped) {
    const w = weaponOf(a);
    const ok = !!w && usable(capability(a), w);
    if (ok && !dropped) return;
    const best = ok ? a.cur : bestUsable(a);
    if (best < 0) return;
    a.action = { type: 'switch', t: 0, dur: WEAPONS[a.weapons[best].id].drawTime / (a.mods?.handling ?? 1) + ONE_HAND_DRAW, to: best };
    this.events.push({ type: 'switch', actorId: a.id, stage: 'start' });
    this.emit(a, 'switch');
  }

  // Note: a weapon off the floor goes into a free slot, or only its rounds are taken when the slot is full.
  takeItem(a, id) {
    const i = this.items.findIndex((x) => x.id === id);
    const it = this.items[i];
    if (!it || it.floor !== a.floor || Math.hypot(it.x - a.x, it.y - a.y) > ITEM_REACH + 0.3) return false;
    const w = it.weapon;
    if (canCarry(a, w)) {
      a.weapons.push(w);
      this.items.splice(i, 1);
    } else {
      a.ammo[w.ammoType] = (a.ammo[w.ammoType] || 0) + w.loaded;
      if (w.loaded) a.tally.looted[w.ammoType] = (a.tally.looted[w.ammoType] || 0) + w.loaded;
      w.loaded = 0;
    }
    this.events.push({ type: 'take', actorId: a.id, itemId: id, weaponId: w.id });
    return true;
  }

  // Note: only one deputy can lift or carry the sheriff at a time.
  carryClaimed(d, s) {
    return this.deputies.some((o) => o !== d && o.status === 'ok' && (o.carrying === s.id || (o.action?.type === 'pickup' && o.action.id === s.id)));
  }

  startCarry(d, s) {
    if (d.action || d.elev || d.carrying || s.carried || dist(d, s) > 1.4 || this.carryClaimed(d, s)) return false;
    d.action = { type: 'pickup', t: 0, dur: 1.5, id: s.id };
    return true;
  }

  completeCarry(d, s) {
    if (!s || s.status === 'dead') return;
    d.carrying = s.id;
    s.carried = true;
    s.carriedBy = d.id;
    s.action = null;
    s.lean = 0;
    if (!d.ai.announced) this.voice(d, 'I have you.');
    d.ai.announced = false;
  }

  releaseCarry(d, why) {
    if (!d) return;
    const s = this.byId(d.carrying);
    d.carrying = null;
    if (s) {
      s.x = d.x; s.y = d.y; s.floor = d.floor; s.elev = d.elev;
      this.updateEye(s);
      s.carried = false;
      s.carriedBy = null;
    }
    if (why === 'resist') {
      d.ai.carryCooldown = this.time + 8;
      this.voice(d, 'Easy!');
    } else if (why) {
      this.events.push({ type: 'carry', actorId: d.id, stage: 'lower', reason: why });
    }
  }

  emit(src, kind, level = SOUND_LEVELS[kind], material = null, extra = null) {
    if (!level) return [];
    const follow = this.follow();
    const listeners = [];
    for (const b of this.actors) {
      if (b === src || b.status === 'dead' || b.withdrawn || (b.status !== 'ok' && b !== follow)) continue;
      listeners.push({ id: b.id, x: b.x, y: b.y, floor: b.floor, threshold: hearingThreshold(b) });
    }
    const heard = propagate(this.map, { x: src.x, y: src.y, f: src.floor }, level, listeners, this.rand);
    const srcRole = src.role || 'world';
    for (const h of heard) {
      const b = this.byId(h.id);
      b.heard.push({ t: this.time, kind, level: h.level, dir: h.dir, pos: h.pos, floor: h.floor, muffle: h.muffle, srcId: src.id ?? -1, srcRole, ...extra });
      if (b === follow) this.events.push({ type: 'heard', kind, level: h.level, dir: h.dir, muffle: h.muffle, own: false, material });
    }
    if (src === follow) this.events.push({ type: 'heard', kind, level, dir: src.facing, muffle: 0, own: true });
    this.soundLog.push({ t: this.time, kind, level, srcId: src.id ?? -1, heardBy: heard.map((h) => h.id) });
    if (this.soundLog.length > 300) this.soundLog.shift();
    return heard;
  }

  // Note: speech is an event for the view plus a sound anyone in range may hear, carrying what it says in extra.
  say(a, text, kind = 'shout', extra = null) {
    this.events.push({ type: 'voice', actorId: a.id, text, spoken: true });
    return this.emit(a, kind, SOUND_LEVELS[kind], null, extra);
  }

  // Note: a checked position waits for the next call; a spot already waiting is not queued twice.
  reportClear(a, position) {
    const queue = (a.ai.clearQueue ||= []);
    if (!queue.some((q) => q.f === position.f && Math.hypot(q.x - position.x, q.y - position.y) < 0.8)) queue.push({ x: position.x, y: position.y, f: position.f });
    this.flushClear(a);
  }

  // Note: one "Clear." carries every position checked since the last call.
  flushClear(a) {
    const ai = a.ai;
    if (!ai.clearQueue?.length || this.time - (ai.clearSaidAt ?? -Infinity) < CLEAR_GAP) return;
    ai.clearSaidAt = this.time;
    this.say(a, 'Clear.', 'whisper', { clears: ai.clearQueue.splice(0) });
  }

  voice(a, text) {
    this.events.push({ type: 'voice', actorId: a.id, text });
  }

  stepBullets() {
    if (!this.bullets.length) return;
    const wev = [];
    const world = { map: this.map, actors: this.actors, rand: this.rand, time: this.time, events: wev, shaft: this.shaft, seed: this.seed };
    for (const b of this.bullets) stepBullet(b, STEP, world);
    this.bullets = this.bullets.filter((b) => !b.dead);
    for (const e of wev) {
      if (e.type === 'hit') {
        const v = this.byId(e.actorId);
        this.events.push(e);
        if (v) {
          this.decals.push({ x: v.x, y: v.y, floor: v.floor, r: 0.25, age: this.time });
          this.emit(v, 'cry');
          v.action = v.action && v.status === 'ok' && (v.action.type === 'reload' || v.action.type === 'switch') ? v.action : null;
          if (v.role === 'sheriff' || v.role === 'deputy') this.voice(v, e.died ? '' : 'I am hit!');
          v.lastHitBy = this.byId(e.ownerId)?.role || null;
          v.lastShotDirection = e.dir;
          this.reactTo(v, e);
          // Note: a hit that puts someone down is a change of status like any other, so the carry, the action and the flight are settled on the spot, not a tick later.
          if (v.status !== 'ok') this.onStatus(v);
        }
      } else if (e.type === 'nearMiss') {
        const a = this.byId(e.actorId);
        if (a) {
          disruptAim(a, 0.3, 0.3);
          a.ai.nearMiss = { t: this.time, x: a.x - Math.cos(e.angle) * 8, y: a.y - Math.sin(e.angle) * 8, f: a.floor };
        }
        this.events.push(e);
      } else if (e.type === 'glass') {
        this.events.push({ type: 'tile', f: e.floor, x: Math.floor(e.x), y: Math.floor(e.y) });
        this.emit({ x: e.x, y: e.y, floor: e.floor, id: -1 }, 'glass');
      } else if (e.type === 'impact') {
        this.events.push(e);
        if (e.material !== 'glass') this.emit({ x: e.x, y: e.y, floor: e.floor, id: -1 }, 'impact', SOUND_LEVELS.impact, e.material);
      }
    }
  }

  // Note: a tiny impulse and a sustained wound reaction, shared by every role.
  reactTo(v, e) {
    const r = hitReaction(e.region, e.severity, { severe: e.severe });
    // Note: someone who is about to collapse, or whose nerve has just broken, is stunned for the whole time; the player's sheriff only loses his shot for it, the AI stands still.
    if (e.stop) {
      const hold = e.stop.kind === 'collapse' ? e.stop.delay + 0.15 : SHOCK.stun;
      r.freeze = Math.max(r.freeze, hold);
      r.noFire = Math.max(r.noFire, hold);
      r.dur = Math.max(r.dur, hold);
    }
    const old = v.react && this.time < v.react.t0 + v.react.dur ? v.react.push : 0;
    v.react = { kind: r.kind, t0: this.time, dur: r.dur, dir: e.dir, side: e.side || 0, region: e.region, severity: e.severity, freeze: r.freeze, push: Math.min(0.03, r.push + old), speed: r.speed, turn: r.turn, noFire: r.noFire };
    if (v.status !== 'ok') return;
    disruptAim(v, r.keep);
    v.steady = false;
    if (e.region === 'arm' && v.action && v.action.type === 'reload') {
      cancelReload(v.action.state);
      v.action = null;
    }
    if (e.region === 'arm') this.armHit(v, e);
    if (e.stop?.kind === 'break' && v.role === 'hostile') this.breakWill(v, e);
    // Note: item 492: each hit makes a wanted target weigh giving up; it is never certain.
    if (v.wanted && !v.surrendered) considerSurrender(this, v, e.stop?.kind === 'break' ? 'break' : 'hit');
    // Note: the AI drops its plan and thinks again next tick; reeling holds the stun.
    if (v !== this.sheriff) {
      v.thinkT = r.freeze;
      v.intent = null;
      v.nav = null;
    }
    // Note: a carrier who is hit hard or in the arm drops the sheriff.
    if (v.carrying && (e.severity >= 0.5 || e.region === 'arm')) {
      this.releaseCarry(v, 'hit');
      v.ai.carryCooldown = this.time + 6;
    }
  }

  // Note: a broken hostile stops fighting for a while with no plea and no dropped gun (items 46, 406); an associate gives himself up (item 291) and a wanted target may (item 492, in the hit handler).
  breakWill(v) {
    v.ai.brokenAt = this.time;
    if (v.associate) this.surrender(v);
  }

  // Note: a man who gives up drops his guns, raises his hands and never fights again; an associate counts as taken at once (item 291), a wanted target only once accepted and secured (item 492).
  surrender(v) {
    if (v.surrendered || v.status !== 'ok') return;
    v.surrendered = true;
    if (v.associate) v.secured = true;
    v.broken = 0;
    v.action = null;
    v.intent = null;
    v.nav = null;
    v.thinkT = 0;
    while (v.weapons.length) this.dropWeapon(v, 0, 'surrender');
    this.events.push({ type: 'surrender', actorId: v.id });
    if (v.wanted) {
      v.pleaAt = this.time;
      this.say(v, "I give up! Don't shoot!");
    } else this.emit(v, 'shout');
  }

  stepWounds() {
    for (const a of this.actors) {
      if (a.status === 'dead') continue;
      const before = a.status;
      updateWounds(a, STEP, this.time, this.rand);
      a.bleeding = a.wounds.some((w) => w.bleed > 0);
      if (a.status !== before) this.onStatus(a);
    }
  }

  onStatus(a) {
    a.action = null;
    a.climb = null;
    a.steady = false;
    if (a.carrying) this.releaseCarry(a);
    this.dropFromFlight(a);
    if (a.carried) this.releaseCarry(this.byId(a.carriedBy));
    this.events.push({ type: 'status', actorId: a.id, status: a.status });
    if (a.role === 'hostile' && a.status !== 'ok' && a.lastShotDirection != null) {
      for (const h of this.hostiles) {
        if (h === a || h.status !== 'ok' || !this.sees(h, a)) continue;
        h.ai.fallen = { x: a.x - Math.cos(a.lastShotDirection) * 8, y: a.y - Math.sin(a.lastShotDirection) * 8, f: a.floor };
        h.thinkT = 0;
      }
    }
    if (a.status === 'dead') {
      a.diedAt = this.time;
      if (this.outcome?.result === 'success' && a.role === 'sheriff') a.afterVictory = true;
      if (this.outcome?.result === 'success' && isLawman(a)) a.afterWin = true;
      this.emit(a, 'body');
    }
  }

  stepDecals() {
    for (const a of this.actors) {
      if (!a.bleeding || a.status === 'dead') continue;
      a.bleedT = (a.bleedT ?? 0) - STEP;
      if (a.bleedT <= 0) {
        a.bleedT = 0.8;
        this.decals.push({ x: a.x + (this.rand() - 0.5) * 0.3, y: a.y + (this.rand() - 0.5) * 0.3, floor: a.floor, r: 0.12 + this.rand() * 0.12, age: this.time });
        if (this.decals.length > 300) this.decals.shift();
      }
    }
  }

  // Note: item 79: the hostiles still to be dealt with; a man who gave up stays here until he is secured (item 492).
  liveHostiles() {
    return this.hostiles.filter((h) => h.status === 'ok' && !h.secured);
  }

  // Note: an associate left alone and seen by the law gives up rather than die (item 291).
  lastStand() {
    const live = this.hostiles.filter((h) => h.status === 'ok' && !h.surrendered);
    if (live.length !== 1 || !live[0].associate) return;
    if (this.lawmen.some((l) => l.status === 'ok' && this.sees(l, live[0]))) this.surrender(live[0]);
  }

  checkOutcome() {
    const o = this.outcome;
    const s = this.sheriff;
    if (o?.final) return;
    if (!o) {
      // Note: a deputy who retreats to safe ground leaves the fight; the rest of the party carries on without him.
      for (const d of this.deputies) {
        if (d.status === 'ok' && !d.withdrawn && (d.ai.fleeing === 'retreat' || (d.passive && d.ai.unfitStage === 'retreat')) && this.isSafe(d)) {
          d.withdrawn = true;
          this.events.push({ type: 'withdrawn', actorId: d.id });
        }
      }
      // Note: an unfit teammate in the scene cannot fight, so he does not keep a lost fight going (item 325).
      const fighting = this.deputies.some((d) => d.status === 'ok' && !d.withdrawn && !d.passive);
      this.lastStand();
      watchWanted(this);
      stepPleas(this);
      deputiesSecure(this);
      if (!this.liveHostiles().length) {
        this.outcome = { result: 'success', reason: 'cleared', final: false, since: this.time };
      } else if (s.status !== 'ok' && !fighting) {
        this.outcome = { result: 'failure', reason: this.downReason(), final: false, since: this.time };
      } else if (this.deputies.some((d) => d.status === 'ok' && this.isSafe(d) && d.ai.fleeing === 'carry' && d.carrying === s.id)) {
        s.carriedOut = true;
        const carrier = this.byId(s.carriedBy);
        if (carrier) carrier.withdrawn = true;
        this.outcome = { result: 'failure', reason: 'the deputy carried the sheriff out', final: false, since: this.time };
      }
      return;
    }
    const waited = this.time - o.since;
    if (waited >= (o.result === 'failure' ? FAIL_DELAY : WIN_DELAY)) this.finalize();
  }

  // Note: the sheriff is down and no deputy is left to fight; the words follow the party's size.
  downReason() {
    const n = this.deputies.filter((d) => !d.passive).length;
    const left = this.deputies.filter((d) => d.status === 'ok' && !d.passive).length;
    if (!n) return 'the sheriff is down';
    if (left) return left === 1 ? 'the sheriff is down and the deputy has withdrawn' : 'the sheriff is down and the deputies have withdrawn';
    return n === 1 ? 'both lawmen down' : 'all lawmen down';
  }

  finalize() {
    const o = this.outcome;
    if (o.result === 'success') {
      // Note: a wound that is already fatal kills when the win shows, with no wait for the bleed-out; onStatus records the death as a loss inside the win.
      for (const a of this.actors) {
        if (a.role === 'hostile' || a.status === 'dead' || a.deathAt == null) continue;
        const w = dieOfWound(a);
        this.events.push({ type: 'died', actorId: a.id, cause: a.cause, region: w.region });
        this.onStatus(a);
      }
    }
    o.final = true;
    this.events.push({ type: 'outcome', result: o.result, reason: o.reason });
  }

  report() {
    const o = this.outcome;
    // Note: an old injury from an earlier scene is not news; only this scene's wounds are reported.
    const fresh = (a) => a.wounds.filter((w) => !w.old);
    const people = [this.sheriff, ...this.deputies, this.civilian].filter(Boolean).map((a) => ({
      role: a.role, name: a.name, status: a.status, cause: a.cause, by: a.lastHitBy || null,
      wounds: fresh(a).map((w) => w.region), diedAfterVictory: !!a.afterVictory, withdrawn: !!a.withdrawn,
    }));
    return {
      result: o?.result || null,
      reason: o?.reason || null,
      seed: this.seed,
      time: this.time,
      hostilesTotal: this.hostiles.length,
      // Note: items 30 and 492: dead, incapacitated, or secured after giving up; a man who gave up but was not secured is not down.
      hostilesDown: this.hostiles.filter((h) => h.status !== 'ok' || h.secured).length,
      hostiles: this.hostiles.map((h) => ({
        status: h.status, cause: h.cause, by: h.lastHitBy || null, ...(h.associate ? { associate: true, surrendered: !!h.surrendered, dying: h.status !== 'dead' && h.deathAt != null } : {}),
        ...(h.wanted ? { wanted: true, surrendered: !!h.surrendered, secured: !!h.secured } : {}),
      })),
      people,
      civilianDied: !!this.civilian && this.civilian.status === 'dead',
      siteKind: this.house.kind,
      terrain: this.house.terrain ?? null,
      lawmen: this.lawmen.map((a) => this.lawmanReport(a, fresh(a))),
      // Note: item 499: bundles of dynamite taken in and still carried at the end.
      dynamite: { carried: this.dynamiteGiven || 0, left: this.sheriff.dynamite || 0 },
    };
  }

  // Note: what the campaign needs of one lawman: how he ended, the new wounds, the guns and rounds he holds, and what he left on the floor.
  lawmanReport(a, wounds) {
    const rounds = { ...a.ammo };
    for (const w of a.weapons) rounds[w.ammoType] = (rounds[w.ammoType] || 0) + w.loaded;
    return {
      charId: a.charId ?? null, role: a.role, name: a.name, status: a.status, cause: a.cause, by: a.lastHitBy || null,
      wounds: wounds.map((w) => ({ region: w.region, side: w.side, severity: w.severity, fatal: !!w.fatal })),
      dying: a.status !== 'dead' && a.deathAt != null,
      withdrawn: !!a.withdrawn, diedAfterVictory: !!a.afterWin, carriedOut: !!a.carriedOut,
      // Note: item 475: the teammate who carried the sheriff out.
      carrier: !!(this.sheriff && this.sheriff.carriedOut && this.sheriff.carriedBy === a.id),
      loadout: a.weapons.map((w) => ({ id: w.id, ammoType: w.ammoType, loaded: w.loaded })),
      reserve: { ...a.ammo },
      rounds,
      floor: this.items.filter((it) => it.by === a.id).map((it) => ({ id: it.weapon.id, ammoType: it.weapon.ammoType, loaded: it.weapon.loaded })),
      fired: { ...a.tally.fired },
      looted: { ...a.tally.looted },
    };
  }

  // Note: the camera and the hearing follow the sheriff, else the first deputy on his feet in party order.
  follow() {
    const s = this.sheriff;
    let f = this.lastFollow || s;
    if (s.status === 'ok') f = s;
    else f = this.deputies.find((d) => d.status === 'ok' && !d.withdrawn && !d.passive)
      || this.deputies.find((d) => d.status === 'ok' && !d.withdrawn) || f;
    this.lastFollow = f;
    return f;
  }

  // Note: careful aim narrows the core over the preset's focus time, in fixed steps of sim time, so it never depends on the frame rate.
  stepFocus(a) {
    const t = this.fovCfg.focus.time;
    const want = a.steady && a.status === 'ok' ? 1 : 0;
    const f = a.focus || 0;
    a.focus = t > 0 ? (want > f ? Math.min(want, f + STEP / t) : Math.max(want, f - STEP / t)) : want;
  }

  // Note: the focus blur follows the sheriff's careful aim and accuracy corridor (items 183 and 184) in fixed steps of sim time; it is a picture only and moves nothing in the sim.
  stepAimView(a) {
    const w = weaponOf(a);
    stepFocusView(a.aimView, a.steady && a.status === 'ok', w ? aimQuality(a, w) : 0, STEP);
  }

  // Note: the corridor of an actor right now, for any actor: sigma in radians (shot error on both axes) and the 0..1 quality the picture is built from.
  aimOf(a) {
    const w = weaponOf(a);
    return w ? { sigma: sigmaFor(a, w), quality: aimQuality(a, w) } : { sigma: 0, quality: 0 };
  }

  // Note: the sharp window the picture uses; the blur is the sheriff's own careful aim only, so another actor in view (a deputy after the sheriff falls) has no blur.
  focusOf(a) {
    const win = focusWindow(a.role === 'sheriff' && a.status === 'ok' ? a.aimView : newFocus(), a.facing);
    return { ...win, active: win.strength > 0 };
  }

  // Note: the zones an actor sees by right now; half and range are the whole field, the zones nest from the core out, and a hostile's experience scales every range.
  farAimActive() {
    const s = this.sheriff;
    const move = this.input.move;
    return this.farAim && s.status === 'ok' && !s.carried && s.mode === 'idle' && !(move && (move.x || move.y));
  }

  fovOf(a) {
    const { zones: base, focus } = this.fovCfg;
    // Note: outdoors in daylight everyone sees half as far again as indoors.
    const mult = (a.role === 'hostile' ? EXP_RANGE[a.traits.experience] : 1) * (this.house?.kind === 'outdoor' ? OUTDOOR_SIGHT : 1);
    const f = focus.time > 0 ? a.focus || 0 : a.steady ? 1 : 0;
    const e = f * f * (3 - 2 * f);
    const mix = (x, y) => (e <= 0 ? x : e >= 1 ? y : x + (y - x) * e);
    const zones = base.map((z, i) => (i ? { ...z, range: z.range * mult } : { ...z, half: mix(z.half, focus.half), range: a === this.sheriff && this.farAimActive() ? Math.max(30, mix(z.range, focus.range) * mult) : mix(z.range, focus.range) * mult }));
    return { half: Math.max(...zones.map((z) => z.half)), range: Math.max(...zones.map((z) => z.range)), near: 0, zones, lowEye: a.stance === 'prone' ? EYE_Z.prone : null };
  }

  // Note: the widest patch of a next floor the followed character sees down or up a stairwell, or null; the cache keeps every patch in list; aiming needs them every tick, so they are cached apart from the whole view.
  throughOf(a) {
    const c = this.throughCache;
    if (c && c.tick === this.tickN && c.id === a.id) return c.through;
    const fov = this.fovOf(a);
    const zo = absZ(a.floor, a.elev || 0, EYE_Z[a.stance]);
    // Note: a patch covers a person's whole height, a visible head above an obscured chest included; neighbouring height spans must overlap, or the one interval kept per ray drops the nearer piece.
    const list = this.shaft.rect ? throughViews(this.map, this.shaft, a.eye, zo, a.facing, fov.half, fov.range, BODY_Z, fov.zones) : [];
    const through = list[0] || null;
    this.throughCache = { tick: this.tickN, id: a.id, through, list };
    return through;
  }

  view() {
    const a = this.follow();
    const c = this.viewCache;
    if (c && c.tick === this.tickN && c.id === a.id) return c;
    const fov = this.fovOf(a);
    // Note: field holds every ray's reach; cone is the outline of the whole field, which is what hides bullets and effects, and the lighting cuts its zone wedges from field.
    // Note: item 497: on relief the drawn field looks from the eye of the stance, so a crouched man sees less over a crest.
    const field = viewField(this.map, a.floor, a.eye, a.facing, fov.half, fov.range, fov.lowEye ?? (this.map.relief && a.floor === 0 ? EYE_Z[a.stance] : null));
    // Note: callers invalidate the view by clearing viewCache, so a rebuilt view must refresh the stairwell patch too.
    this.throughCache = null;
    const through = this.throughOf(a);
    const throughs = this.throughCache.list;
    this.viewCache = { tick: this.tickN, id: a.id, floor: a.floor, eye: a.eye, facing: a.facing, focus: this.focusOf(a), half: fov.half, range: fov.range, near: fov.near, zones: fov.zones, field, cone: fieldOutline(field, fov.zones), disc: [], through, throughs };
    return this.viewCache;
  }

  sees(o, t) {
    if (o.status === 'dead' || o.withdrawn || t.withdrawn) return false;
    // Note: item 485: on outdoor relief every look is a straight 3D line over the ground.
    if (acrossFloor(o, t) || this.map.relief) return this.seesAcross(o, t);
    const fov = this.fovOf(o);
    if (dist(o, t) > fov.range + 0.5) return false;
    const px = -Math.sin(o.facing) * 0.22;
    const py = Math.cos(o.facing) * 0.22;
    const pts = [[t.x, t.y], [t.eye.x, t.eye.y], [t.x + px, t.y + py], [t.x - px, t.y - py]];
    return pts.some(([x, y]) => canSeePoint(this.map, o.floor, o.eye, o.facing, fov, x, y) &&
      (t.stance !== 'prone' || castRay(this.map, o.floor, o.eye.x, o.eye.y, x, y, [EYE_Z[o.stance], EYE_Z.prone]).clear));
  }

  // Note: another floor or someone on the stairs is seen along a straight 3D line, which only passes the slab inside the stairwell.
  seesAcross(o, t) {
    const fov = this.fovOf(o);
    if (dist(o, t) > fov.range + 0.5) return false;
    const zo = absZ(o.floor, o.elev || 0, EYE_Z[o.stance]);
    const px = -Math.sin(o.facing) * 0.22;
    const py = Math.cos(o.facing) * 0.22;
    const chest = absZ(t.floor, t.elev || 0, CHEST_Z[t.stance]);
    const head = absZ(t.floor, t.elev || 0, EYE_Z[t.stance]);
    // Note: the body below the head counts too, because the through patch lights every body height.
    const body = BODY_Z.filter((z) => z <= HEIGHT[t.stance]).map((z) => [t.x, t.y, absZ(t.floor, t.elev || 0, z)]);
    const pts = [[t.x, t.y, chest], [t.eye.x, t.eye.y, head], [t.x + px, t.y + py, chest], [t.x - px, t.y - py, chest], ...body];
    return pts.some(([x, y, z]) => canSeePoint3(this.map, this.shaft, o.eye, zo, o.facing, fov, x, y, z));
  }

  // Note: the innermost zone holding a seen target's sample points, -1 when unseen; it sets how slowly an NPC recognises the target (SPEC item 72).
  seeZone(o, t) {
    if (!this.sees(o, t)) return -1;
    const fov = this.fovOf(o);
    const px = -Math.sin(o.facing) * 0.22;
    const py = Math.cos(o.facing) * 0.22;
    let best = fov.zones.length - 1;
    for (const [x, y] of [[t.x, t.y], [t.eye.x, t.eye.y], [t.x + px, t.y + py], [t.x - px, t.y - py]]) {
      const i = zoneIndex(fov.zones, Math.abs(angleDiff(o.facing, Math.atan2(y - o.eye.y, x - o.eye.x))), Math.hypot(x - o.eye.x, y - o.eye.y));
      if (i >= 0 && i < best) best = i;
    }
    return best;
  }

  canSeeActor(observer, target) {
    return observer === target || this.sees(observer, target);
  }

  // Note: item 497: on relief, the height above his own ground from which o sees t; 0 when t's ground (SCRUB, the lowest body point) shows, off relief or across floors, so a man on hidden ground is drawn from the rim up.
  shownFrom(o, t) {
    if (!this.map.relief || o === t || o.floor !== 0 || acrossFloor(o, t)) return 0;
    const fov = this.fovOf(o);
    const zo = absZ(o.floor, o.elev || 0, EYE_Z[o.stance]);
    const top = HEIGHT[t.stance];
    for (const z of BODY_Z) {
      if (z > top) break;
      if (canSeePoint3(this.map, this.shaft, o.eye, zo, o.facing, fov, t.x, t.y, absZ(t.floor, t.elev || 0, z))) return z <= BODY_Z[0] ? 0 : z;
    }
    return top;
  }

  pointVisible(o, x, y) {
    return canSeePoint(this.map, o.floor, o.eye, o.facing, this.fovOf(o), x, y);
  }

  // Note: the end of a clear ray from the actor's eye along its facing, at most maxLen metres.
  // Note: the free cells on the actor's floor that its eyes reach right now, up to range metres; a hostile standing on one takes it out.
  visibleCells(a, range = 12) {
    const fov = { ...this.fovOf(a), range: Math.min(range, this.fovOf(a).range) };
    const out = [];
    const x0 = Math.max(0, Math.floor(a.eye.x - fov.range));
    const x1 = Math.min(this.map.W - 1, Math.floor(a.eye.x + fov.range));
    const y0 = Math.max(0, Math.floor(a.eye.y - fov.range));
    const y1 = Math.min(this.map.H - 1, Math.floor(a.eye.y + fov.range));
    const foes = this.actors.filter((o) => o.status === 'ok' && !o.surrendered && o.floor === a.floor && o.role === 'hostile' && this.sees(a, o));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (solidAt(this.map, a.floor, x, y)) continue;
        if (foes.some((o) => Math.hypot(o.x - (x + 0.5), o.y - (y + 0.5)) < 1.2)) continue;
        if (canSeePoint(this.map, a.floor, a.eye, a.facing, fov, x + 0.5, y + 0.5)) out.push({ x, y });
      }
    }
    return out;
  }
  rayAhead(a, maxLen) {
    const hit = castRay(this.map, a.floor, a.eye.x, a.eye.y, a.eye.x + Math.cos(a.facing) * maxLen, a.eye.y + Math.sin(a.facing) * maxLen);
    return { x: hit.x, y: hit.y };
  }

  isSafe(a) {
    return a.floor === 0 && (a.x <= 1.7 || a.y <= 1.7 || a.x >= this.map.W - 1.7 || a.y >= this.map.H - 1.7) && !solidAt(this.map, 0, Math.floor(a.x), Math.floor(a.y));
  }
}

export { SAFE_DIST };
