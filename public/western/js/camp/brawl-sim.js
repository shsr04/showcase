// Note: a saloon fight on the room's own floor plan; pure and seeded, outside the campaign save, and only its finished report is committed.
import { makeActor } from '../actors.js';
import { applyMember, skillMods, simSkill } from '../party.js';
import { RADIUS } from '../config.js';
import { fireWeapon, tickWeapon, startReload, stepReload, stepSettle, disruptAim, WEAPONS } from '../weapons.js';
import { applyHit, hitTestActor, oldWound, updateWounds, capability, hitReaction, SHOCK } from '../wounds.js';
import { rng, clamp, lerp, seedFromString } from '../rand.js';
import { simInjuries } from './crew.js';
import { buildRoom, reachable } from './saloon-room.js';
import { clone } from './base.js';
import { drinkEffects, levelOf, hangoverOf, lurch } from './drink.js';

// Note: every number a fight rolls on, in one table; a test passes spec.tune to force a blow, a draw or an arrival, never a hunt for a seed.
export const BRAWL = Object.freeze({
  reach: 1.15,
  grabReach: 1.05,
  cooldown: 0.8,
  hit: 0.72,
  heldHit: 0.93,
  grab: 0.78,
  serious: 0.12,
  fatal: 0.02,
  light: [0.1, 0.25],
  heavy: [0.5, 0.85],
  headShare: 0.65,
  flash: 0.05,
  stagger: 0.7,
  tough: [2.4, 4.2],
  hold: 2.5,
  holdSurrender: 0.7,
  breakFree: 0.3,
  breakAuto: 0.1,
  pins: 3,
  escalate: 0.22,
  escalateAt: [8, 30],
  desperate: 0.15,
  respond: 1.4,
  calm: 1.5,
  gunRange: 7.5,
  quit: [70, 130],
  surrender: 0.5,
  limit: 200,
  lull: 30,
  speed: 2.4,
  aiSpeed: 2,
  fleeSpeed: 2.7,
  arrive: [5, 11],
});

// Note: one definition of "still in the fight" for the sim and for the campaign's check of a report; arrival is separate.
export const standing = (status, exit) => status === 'ok' && !exit;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REGION_SIDE = { head: 0, chest: 0, abdomen: 0 };
const NOTE_CAP = 48;

// Note: the walls, the furniture and the routes of one room; cells are one metre, bodies are circles of RADIUS.
function makeGrid(room) {
  const { w, h, blocked, doorX } = room;
  const doorCell = (h - 1) * w + doorX;
  const shut = (cx, cy, leaving) => {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return true;
    const i = cy * w + cx;
    return !!blocked[i] && !(leaving && i === doorCell);
  };
  const solid = (x, y, r = RADIUS, leaving = false) => {
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
        if (!shut(cx, cy, leaving)) continue;
        const dx = Math.max(cx - x, 0, x - (cx + 1));
        const dy = Math.max(cy - y, 0, y - (cy + 1));
        if (Math.hypot(dx, dy) < r) return true;
      }
    }
    return false;
  };
  const clear = (ax, ay, bx, by, leaving = false) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2));
    for (let i = 1; i < n; i++) if (solid(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, RADIUS * 0.9, leaving)) return false;
    return true;
  };
  // Note: 8-way breadth-first search without corner cutting; null when no way leads there.
  const route = (from, to, leaving = false) => {
    const start = Math.floor(from.y) * w + Math.floor(from.x);
    const end = Math.floor(to.y) * w + Math.floor(to.x);
    const open = (i) => i === end || !shut(i % w, Math.floor(i / w), leaving);
    if (start === end) return [{ x: to.x, y: to.y }];
    const prev = new Map([[start, -1]]);
    const todo = [start];
    for (let head = 0; head < todo.length && !prev.has(end); head++) {
      const c = todo[head];
      const x = c % w;
      const y = (c - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (prev.has(n) || !open(n)) continue;
        if (dx && dy && (shut(nx, y, leaving) || shut(x, ny, leaving))) continue;
        prev.set(n, c);
        todo.push(n);
      }
    }
    if (!prev.has(end)) return null;
    const cells = [];
    for (let c = end; c !== start; c = prev.get(c)) cells.push(c);
    cells.reverse();
    const path = cells.map((c) => ({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 }));
    path[path.length - 1] = { x: to.x, y: to.y };
    return path;
  };
  return { solid, clear, route, w, h };
}

// Note: where a fight starts, given the room: the pair meets on open floor in front of the bar and away from the door; the rest stand beside them.
export function startPlan(room, seed, count) {
  const seen = reachable(room);
  const R = rng(seedFromString(`brawl-start:${seed}`));
  const open = (x, y) => x >= 1 && y >= 1 && x < room.w - 1 && y < room.h - 1 && !!seen[y * room.w + x] && !room.blocked[y * room.w + x];
  let meets = [];
  for (let y = 4; y <= 5; y++) for (let x = 2; x <= room.w - 3; x++) if (open(x, y) && open(x - 1, y) && open(x + 1, y) && Math.abs(x + 0.5 - room.spawn.x) >= 4) meets.push({ x, y });
  if (!meets.length) for (let y = 4; y <= 5; y++) for (let x = 2; x <= room.w - 3; x++) if (open(x, y) && open(x - 1, y) && open(x + 1, y)) meets.push({ x, y });
  if (!meets.length) for (let y = 1; y < room.h - 1; y++) for (let x = 1; x < room.w - 1; x++) if (open(x, y)) meets.push({ x, y });
  const meet = R.pick(meets);
  const dir = room.spawn.x < meet.x + 0.5 ? -1 : 1;
  const cells = [];
  for (let y = 1; y < room.h - 1; y++) for (let x = 1; x < room.w - 1; x++) if (open(x, y)) cells.push({ x: x + 0.5, y: y + 0.5 });
  const taken = [];
  const take = (ax, ay) => {
    const free = cells.filter((c) => taken.every((t) => Math.hypot(t.x - c.x, t.y - c.y) >= 0.95));
    const best = free.sort((a, b) => Math.hypot(a.x - ax, a.y - ay) - Math.hypot(b.x - ax, b.y - ay))[0] || { x: ax, y: ay };
    taken.push(best);
    return best;
  };
  const cx = meet.x + 0.5;
  const cy = meet.y + 0.5;
  const anchors = [[cx, cy], [cx - dir, cy], [cx - dir * 1.1, cy + (meet.y === 4 ? 1 : -1)], [cx + dir * 0.2, cy + (meet.y === 4 ? 1 : -1)]];
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = anchors[i] || [cx - dir * (1 + i * 0.5), cy];
    const at = take(a[0], a[1]);
    out.push({ x: at.x, y: at.y });
  }
  // Note: everyone starts turned toward the centre of the scuffle.
  const mid = { x: cx - dir * 0.5, y: cy };
  return out.map((p) => ({ ...p, facing: Math.atan2(mid.y - p.y, mid.x - p.x) }));
}

export class BrawlSim {
  // Note: a saved fight carries what it needs, so a restart is the same fight again.
  constructor(spec) {
    if (!spec || !Array.isArray(spec.fighters) || !spec.fighters.length) throw new Error('A saved fight is required.');
    this.spec = clone(spec);
    this.tune = { ...BRAWL, ...(this.spec.tune || {}) };
    this.random = rng(this.spec.seed);
    this.room = buildRoom(this.spec.room?.seed ?? this.spec.seed, this.spec.room?.town || {});
    this.grid = makeGrid(this.room);
    this.time = 0;
    this.done = false;
    this.result = null;
    this.lastEvent = null;
    this.events = [];
    this.eventNo = 0;
    this.escalated = false;
    this.lastBlow = 0;
    this.aimId = null;
    this.fighters = this.spec.fighters.map((f, i) => this.make(f, i));
    this.player = this.fighters.find((f) => f.id === this.spec.playerId) || null;
  }

  make(f, i) {
    const t = this.tune;
    const crew = !!f.person;
    const role = f.id === this.spec.playerId || f.role === 'sheriff' ? 'sheriff' : f.side === 'defender' ? 'deputy' : 'hostile';
    const actor = makeActor(i + 1, role, f.x, f.y, 0, { name: f.name, hand: f.hand || 'right', loadout: f.weapon ? [f.weapon] : [] });
    actor.salt = this.spec.seed;
    // Note: item 346: drink widens the aim of everyone in the fight, crew and troublemakers alike.
    const sober = f.person || { drink: f.drink };
    if (crew) applyMember(actor, { ...f.person, injuries: simInjuries(f.person), loadout: f.weapon ? [f.weapon] : [], charId: f.id, intoxication: levelOf(sober), hangover: hangoverOf(sober) });
    else {
      for (const injury of f.injuries || []) actor.wounds.push(oldWound(injury));
      if (levelOf(sober)) actor.mods = { ...skillMods({}, 0), aim: drinkEffects(sober).aim };
    }
    if (f.weapon) {
      actor.weapons[0].loaded = f.loaded;
      actor.ammo[f.weapon.ammoType] = f.reserve || 0;
    }
    actor.facing = f.facing ?? 0;
    const skill = simSkill(f.person?.skill);
    const grit = f.grit ?? clamp(0.3 + 0.6 * skill.nerve, 0, 1);
    const temper = f.temper ?? 0.5;
    const burden = actor.wounds.reduce((s, w) => s + (w.severity || 0), 0);
    // Note: item 346: a drinker feels less pain, so he takes more before he goes down, but guards worse and stands less steady.
    const drunk = drinkEffects(sober);
    const tough = lerp(t.tough[0], t.tough[1], grit) * (1 - 0.2 * (f.person?.fatigue || 0)) * (1 - 0.18 * Math.min(1, burden / 1.5)) / drunk.pain;
    const armed = !!f.weapon && f.loaded + (f.reserve || 0) > 0;
    const arrives = f.arrive > 0;
    const fighter = {
      id: f.id, name: f.name, side: f.side, crew, kind: f.kind || null, look: f.look || 0, actor,
      grit, temper, nerve: skill.nerve, handling: skill.handling, toughness: tough, daze: 0, blows: 0, exposed: drunk.guard, unsteady: drunk.unsteady, slow: drunk.slow,
      present: !arrives, arriveAt: arrives ? f.arrive : 0, gone: false, leaving: false, withdrawing: false,
      cooldown: 0, grapple: null, heldBy: null, exit: null, drawn: false, drawT: 0, reloading: null, roundsFired: 0,
      hitAt: -9, hitRegion: null, punchAt: -9, shotAt: -9, fellAt: null, staggerUntil: 0, struggleAt: -9, moving: false, travel: 0,
      ai: { t: this.random.range(0.05, 0.35), react: lerp(0.45, 0.22, temper) * lerp(1.15, 0.85, skill.handling) * drunk.slow, targetId: null, path: null, pathAt: -9, pathFor: null, fireAt: 0, calm: 0, revenge: null, pins: 0, struggleT: 0.5 },
      escalationAt: f.side === 'aggressor' && armed && this.random.chance(t.escalate) ? this.random.range(t.escalateAt[0], t.escalateAt[1]) : Infinity,
      quitAt: f.person ? Infinity : this.random.range(t.quit[0], t.quit[1]) * (0.7 + 0.6 * grit),
    };
    if (arrives) {
      actor.x = this.room.spawn.x;
      actor.y = this.room.spawn.y;
    }
    actor.eye = { x: actor.x, y: actor.y };
    return fighter;
  }

  // Note: the one place an event is recorded; the view reads events by number and draws sparks, flashes and the live line from them.
  event(type, text, extra = {}) {
    this.eventNo++;
    if (type === 'hit' || type === 'miss' || type === 'grab' || type === 'shot') this.lastBlow = this.time;
    const e = { n: this.eventNo, time: this.time, type, text, ...extra };
    this.events.push(e);
    if (this.events.length > NOTE_CAP) this.events.shift();
    this.lastEvent = { time: this.time, text, type };
    return e;
  }

  // Note: a fighter who is in the room, on their feet and still in it.
  active(f) {
    return !!f && f.present && !f.gone && standing(f.actor.status, f.exit);
  }

  // Note: a fighter who has given up and is on the way out; they take no part, but they still walk and still block the way.
  running(f) {
    return !!f && f.present && !f.gone && f.actor.status === 'ok' && f.exit === 'fled';
  }

  // Note: a defender who has not come through the door yet still counts as the fight's side.
  pending(f) {
    return !!f && !f.present && f.side === 'defender' && standing(f.actor.status, f.exit);
  }

  foes(f) {
    return this.fighters.filter((o) => o.side !== f.side && this.active(o));
  }

  nearest(f) {
    return this.foes(f).sort((a, b) => dist(a.actor, f.actor) - dist(b.actor, f.actor))[0] || null;
  }

  byId(id) {
    return this.fighters.find((x) => x.id === id) || null;
  }

  weaponOf(f) {
    return f.actor.weapons[0] || null;
  }

  reserveOf(f) {
    const w = this.weaponOf(f);
    return w ? f.actor.ammo[w.ammoType] || 0 : 0;
  }

  // Note: a gun that can still be drawn and fired by someone whose arms allow it.
  armed(f) {
    const w = this.weaponOf(f);
    return !!w && w.loaded + this.reserveOf(f) > 0 && capability(f.actor).handgunOk;
  }

  // Note: true when the fighter can take an action now: in the room, on their feet, not held and not walking out.
  free(f) {
    return this.active(f) && !f.heldBy && !f.leaving;
  }

  // Note: who the player's blow lands on: the aimed one in reach, else the nearest in reach.
  inReach(f, range, target) {
    const pick = target || (this.aimId ? this.byId(this.aimId) : null);
    if (pick && pick.side !== f.side && this.active(pick) && dist(pick.actor, f.actor) <= range) return pick;
    const near = this.nearest(f);
    return near && dist(near.actor, f.actor) <= range ? near : null;
  }

  face(f, o) {
    f.actor.facing = Math.atan2(o.actor.y - f.actor.y, o.actor.x - f.actor.x);
  }

  // Note: aim for the player's gun: set by the pointer or by cycling; null means the nearest foe.
  aim(id) {
    this.aimId = id;
  }

  cycleAim() {
    const player = this.player;
    if (!player) return null;
    const list = this.foes(player).sort((a, b) => dist(a.actor, player.actor) - dist(b.actor, player.actor));
    if (!list.length) return null;
    const at = list.findIndex((o) => o.id === this.aimId);
    this.aimId = list[(at + 1) % list.length].id;
    return this.aimId;
  }

  punch(f = this.player, target = null) {
    if (!this.active(f) || f.leaving) return false;
    if (f.heldBy) return this.struggle(f);
    if (f.grapple || f.cooldown > 0) return false;
    const foe = this.inReach(f, this.tune.reach, target);
    if (!foe) return false;
    if (f.drawn) this.holster(f);
    this.face(f, foe);
    f.cooldown = this.tune.cooldown;
    f.punchAt = this.time;
    const t = this.tune;
    const pinned = !!foe.heldBy;
    const p = clamp((pinned ? t.heldHit : t.hit) + 0.15 * (f.handling - 0.5) - 0.15 * (f.actor.fatigue || 0) + (foe.exposed || 0) - 0.1 * (f.unsteady || 0), 0, 1);
    if (!this.random.chance(p)) {
      this.event('miss', `${f.name} misses ${foe.name}.`, { who: f.id, target: foe.id });
      return true;
    }
    this.blow(f, foe);
    return true;
  }

  // Note: a landed blow: light, or now and then heavy, rarely deadly; the wound is the campaign's injury as it stands.
  blow(f, foe) {
    const t = this.tune;
    const serious = this.random.chance(t.serious);
    const fatal = serious && this.random.chance(t.fatal);
    const head = this.random.chance(t.headShare);
    const region = head ? 'head' : this.random.chance(0.7) ? 'chest' : 'abdomen';
    const severity = serious ? this.random.range(t.heavy[0], t.heavy[1]) : this.random.range(t.light[0], t.light[1]);
    foe.actor.wounds.push({
      region, side: REGION_SIDE[region], severity, fatal, old: false, instant: false, bleed: 0, at: this.time, deathAt: null, incapAt: null, clotAt: null, energy: 0, severe: false, collapsed: false, fist: true,
    });
    foe.blows++;
    foe.daze += severity * (head ? 1.3 : 1);
    foe.hitAt = this.time;
    foe.hitRegion = region;
    foe.ai.revenge = f.id;
    this.event('hit', `${f.name} strikes ${foe.name}.`, { who: f.id, target: foe.id, region, severity, x: foe.actor.x, y: foe.actor.y });
    if (serious) {
      foe.staggerUntil = this.time + t.stagger;
      foe.cooldown = Math.max(foe.cooldown, 0.4);
      if (foe.grapple) this.release(foe);
    }
    if (fatal) this.fall(foe, 'dead', 'a fatal blow');
    else if (foe.daze >= foe.toughness || (serious && head && this.random.chance(t.flash))) this.fall(foe, 'incapacitated', 'knocked out');
  }

  fall(f, status, cause) {
    if (f.actor.status === 'ok') {
      f.actor.status = status;
      f.actor.cause = cause;
    }
    this.settleDown(f);
  }

  // Note: the one place a fallen fighter is cleaned up, whether a blow, a round or a bleed put them down.
  settleDown(f) {
    if (f.fellAt != null) return;
    f.fellAt = this.time;
    f.drawn = false;
    f.drawT = 0;
    f.reloading = null;
    f.moving = false;
    f.leaving = false;
    this.release(f);
    for (const o of this.fighters) if (o.grapple && o.grapple.target === f.id) this.release(o);
    this.event('down', `${f.name} ${f.actor.status === 'dead' ? 'is dead' : 'is knocked out'}.`, { who: f.id, status: f.actor.status });
  }

  grapple(f = this.player, target = null) {
    if (!this.active(f) || f.leaving) return false;
    if (f.grapple) {
      this.release(f);
      return true;
    }
    if (f.heldBy) return this.struggle(f);
    if (f.cooldown > 0) return false;
    const foe = this.inReach(f, this.tune.grabReach, target);
    if (!foe || foe.heldBy || foe.grapple) return false;
    if (f.drawn) this.holster(f);
    this.face(f, foe);
    f.cooldown = 0.6;
    if (!this.random.chance(this.tune.grab)) {
      this.event('miss', `${f.name} grabs at ${foe.name} and misses.`, { who: f.id, target: foe.id });
      return true;
    }
    f.grapple = { target: foe.id, elapsed: 0 };
    foe.heldBy = f.id;
    foe.drawn = false;
    foe.reloading = null;
    foe.ai.pins = 0;
    // Note: the held one is pulled in close, so the two stand chest to chest.
    const fx = f.actor.x + Math.cos(f.actor.facing) * 0.72;
    const fy = f.actor.y + Math.sin(f.actor.facing) * 0.72;
    if (!this.grid.solid(fx, fy)) {
      foe.actor.x = fx;
      foe.actor.y = fy;
    }
    foe.actor.facing = f.actor.facing + Math.PI;
    this.event('grab', `${f.name} grabs ${foe.name}.`, { who: f.id, target: foe.id });
    return true;
  }

  release(f) {
    if (!f.grapple) return false;
    const held = this.byId(f.grapple.target);
    if (held && held.heldBy === f.id) held.heldBy = null;
    f.grapple = null;
    return true;
  }

  // Note: a held fighter pulls free by chance; the player presses punch or grapple to try.
  struggle(f) {
    if (!f.heldBy || this.time - f.struggleAt < 0.25) return false;
    f.struggleAt = this.time;
    const holder = this.byId(f.heldBy);
    if (holder && this.random.chance(this.tune.breakFree * (0.7 + 0.6 * f.grit))) {
      this.event('free', `${f.name} breaks free of ${holder.name}.`, { who: f.id, target: holder.id });
      this.release(holder);
    }
    return true;
  }

  draw(f = this.player) {
    if (!this.active(f) || f.drawn || f.heldBy || f.grapple || f.leaving || !this.armed(f)) return false;
    f.drawn = true;
    // Note: item 465: Precision quickens the draw, as in a tactical scene.
    f.drawT = (WEAPONS[this.weaponOf(f).id].drawTime * (f.slow || 1)) / (f.actor.mods?.handling || 1);
    f.ai.fireAt = this.time + f.drawT + 0.3 + 0.4 * this.random.next();
    this.escalated = true;
    this.event('draw', `${f.name} draws a revolver.`, { who: f.id });
    return true;
  }

  holster(f = this.player) {
    if (!f || !f.drawn) return false;
    f.drawn = false;
    f.drawT = 0;
    f.reloading = null;
    this.event('holster', `${f.name} puts the revolver away.`, { who: f.id });
    return true;
  }

  gunFoe(f, target = null) {
    if (target && target.side !== f.side && this.active(target)) return target;
    if (f === this.player) {
      const aimed = this.aimId ? this.byId(this.aimId) : null;
      if (aimed && aimed.side !== f.side && this.active(aimed)) return aimed;
    }
    return this.nearest(f);
  }

  fire(f = this.player, target = null) {
    if (!this.active(f) || !f.drawn || f.drawT > 0 || f.heldBy || f.grapple || f.leaving) return false;
    if (f.actor.react && this.time < f.actor.react.t0 + f.actor.react.noFire) return false;
    const foe = this.gunFoe(f, target);
    const weapon = this.weaponOf(f);
    if (!foe || !weapon) return false;
    if (f.reloading) {
      if (weapon.loaded <= 0) return false;
      f.reloading = null;
    }
    const a = f.actor;
    const b = foe.actor;
    const range = dist(a, b);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    a.facing = angle;
    const shot = fireWeapon(a, weapon, { angle, dist: range }, this.random.next);
    // Note: item 465: Precision quickens working the hammer between shots.
    if (shot.ok && a.mods?.handling) weapon.cool /= a.mods.handling;
    if (!shot.ok) {
      if (shot.reason === 'empty') this.event('click', `${f.name}'s revolver clicks empty.`, { who: f.id });
      // Note: item 369: a dead round still leaves the gun.
      if (shot.reason === 'misfire') {
        f.roundsFired++;
        this.event('click', `${f.name}'s revolver misfires.`, { who: f.id });
      }
      return false;
    }
    f.roundsFired++;
    f.shotAt = this.time;
    const bullet = shot.bullet;
    const x = a.x + range * Math.cos(bullet.angle);
    const y = a.y + range * Math.sin(bullet.angle);
    const z = bullet.z + range * bullet.vz;
    const hit = hitTestActor(b, x, y, z);
    let res = null;
    if (hit) res = applyHit(b, hit, bullet.energy * Math.exp(-(bullet.drag ?? 0.004) * range), this.random.next, this.time, { range, seed: this.spec.seed });
    this.event('shot', `${f.name} fires${hit ? ` and hits ${foe.name}` : ' and misses'}.`, { who: f.id, target: foe.id, hit: !!hit, region: hit?.region || null, severity: res?.wound?.severity, severe: res?.wound?.severe, side: hit?.side || 0, from: { x: a.x, y: a.y }, angle: bullet.angle, range });
    if (hit && res) {
      const reaction = hitReaction(hit.region, res.wound.severity, { severe: res.wound.severe });
      if (res.stop) reaction.noFire = Math.max(reaction.noFire, res.stop.kind === 'collapse' ? res.stop.delay + 0.15 : SHOCK.stun);
      b.react = { ...reaction, t0: this.time, dir: bullet.angle, side: hit.side || 0, region: hit.region, severity: res.wound.severity };
      foe.staggerUntil = Math.max(foe.staggerUntil, this.time + reaction.freeze);
      disruptAim(b, reaction.keep);
      foe.hitAt = this.time;
      foe.hitRegion = hit.region;
      foe.ai.revenge = f.id;
      this.release(foe);
      const holder = foe.heldBy ? this.byId(foe.heldBy) : null;
      if (holder) this.release(holder);
      if (res.died) this.fall(foe, 'dead', 'shot');
      else if (res.incapacitated) this.fall(foe, 'incapacitated', 'shot');
      else if (res.stop?.kind === 'break' && !foe.crew && foe !== this.player) this.quit(foe, this.random.chance(this.tune.surrender) ? 'surrendered' : 'fled');
    }
    return true;
  }

  reload(f = this.player) {
    if (!this.active(f) || !f.drawn || f.drawT > 0 || f.heldBy || f.grapple || f.reloading || !this.weaponOf(f) || !capability(f.actor).handgunOk) return false;
    f.reloading = startReload(f.actor, this.weaponOf(f));
    if (f.reloading) this.event('reload', `${f.name} reloads.`, { who: f.id });
    return !!f.reloading;
  }

  // Note: the sheriff walks out through the door; the fight goes on without them, and any movement key calls it off.
  withdraw(f = this.player) {
    if (!this.active(f) || f.heldBy || f.leaving) return false;
    this.release(f);
    this.holster(f);
    f.leaving = true;
    f.withdrawing = true;
    f.ai.path = null;
    this.event('withdraw', `${f.name} heads for the door.`, { who: f.id });
    return true;
  }

  quit(f, how) {
    if (f.exit || !this.active(f)) return;
    f.exit = how;
    f.drawn = false;
    f.reloading = null;
    f.ai.path = null;
    this.release(f);
    for (const o of this.fighters) if (o.grapple && o.grapple.target === f.id) this.release(o);
    f.leaving = how === 'fled';
    this.event(how, `${f.name} ${how === 'fled' ? 'runs for the door' : 'puts up both hands'}.`, { who: f.id });
  }

  step(dt, movement = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.done) {
      this.coast(Math.min(dt, 10));
      return;
    }
    let left = Math.min(dt, 10);
    while (left > 1e-8 && !this.done) {
      const delta = Math.min(0.05, left);
      left -= delta;
      this.tick(delta, movement);
    }
  }

  tick(dt, movement) {
    this.time += dt;
    for (const f of this.fighters) {
      if (!f.present && this.time >= f.arriveAt && standing(f.actor.status, f.exit)) {
        f.present = true;
        this.event('arrive', `${f.name} comes in from the street.`, { who: f.id });
      }
      f.cooldown = Math.max(0, f.cooldown - dt);
      f.drawT = Math.max(0, f.drawT - dt);
      const weapon = this.weaponOf(f);
      if (f.actor.react && this.time >= f.actor.react.t0 + f.actor.react.dur) f.actor.react = null;
      if (weapon) tickWeapon(weapon, dt);
      if (f.reloading && weapon && stepReload(f.actor, weapon, f.reloading, dt * (f.actor.mods?.handling || 1)).done) f.reloading = null;
      const events = updateWounds(f.actor, dt, this.time);
      if (events.length || (f.actor.status !== 'ok' && f.fellAt == null)) this.settleDown(f);
      if (f.actor.status !== 'ok' && f.grapple) this.release(f);
    }
    if (this.time >= this.tune.limit || this.time - this.lastBlow >= this.tune.lull) for (const f of this.fighters) if (f.side === 'aggressor' && this.active(f)) this.quit(f, 'surrendered');
    for (const f of this.fighters) {
      if (!this.active(f) && !this.running(f)) continue;
      f.moving = false;
      if (f.grapple) this.hold(f, dt);
      if (f.leaving) this.walkOut(f, dt, movement);
      else if (f === this.player) this.drive(f, movement, dt);
      else this.think(f, dt);
      f.actor.eye = { x: f.actor.x, y: f.actor.y };
      const weapon = this.weaponOf(f);
      if (f.drawn && weapon) {
        f.actor.mode = f.moving ? 'walk' : 'idle';
        stepSettle(f.actor, weapon, dt, { steady: !f.moving && f.drawT <= 0 });
      }
    }
    this.separate();
    this.checkEnd();
  }

  // Note: after the end the clock and the report stand still; only those on their way out keep walking, so the view can show them leave.
  coast(dt) {
    for (const f of this.fighters) {
      if (!this.running(f)) continue;
      const left = dt;
      for (let t = 0; t < left - 1e-9; t += 0.05) {
        f.moving = false;
        this.walkOut(f, Math.min(0.05, left - t), {});
        if (f.gone) break;
      }
    }
    this.separate();
  }

  checkEnd() {
    if (this.done) return;
    if (!this.fighters.some((f) => f.side === 'aggressor' && standing(f.actor.status, f.exit))) {
      this.done = true;
      this.result = 'won';
    } else if (!this.fighters.some((f) => f.side === 'defender' && standing(f.actor.status, f.exit))) {
      this.done = true;
      this.result = 'lost';
    }
    if (this.done) this.event('end', this.result === 'won' ? 'The fight is over.' : 'The fight is lost.', { result: this.result });
  }

  // Note: the holder keeps a grip; a defender's hold ends in a surrender or a faint, an aggressor's in a few blows on the held one.
  hold(f, dt) {
    const g = f.grapple;
    const held = this.byId(g.target);
    if (!held || !this.active(held) || held.heldBy !== f.id) {
      this.release(f);
      return;
    }
    g.elapsed += dt;
    if (f.side === 'defender' && g.elapsed >= this.tune.hold) {
      this.release(f);
      if (!held.crew && this.random.chance(this.tune.holdSurrender * (1.2 - held.grit))) this.quit(held, 'surrendered');
      else {
        this.fall(held, 'incapacitated', 'held until limp');
        this.event('down', `${held.name} goes limp.`, { who: held.id, status: 'incapacitated' });
      }
    }
  }

  moveBy(f, dx, dy, leaving = false) {
    const a = f.actor;
    const px = a.x;
    const py = a.y;
    if (dx && !this.grid.solid(a.x + dx, a.y, RADIUS, leaving)) a.x += dx;
    if (dy && !this.grid.solid(a.x, a.y + dy, RADIUS, leaving)) a.y += dy;
    const moved = Math.hypot(a.x - px, a.y - py);
    if (moved > 1e-6) {
      f.moving = true;
      f.travel += moved;
    }
    return moved;
  }

  speedOf(f, base) {
    return base * capability(f.actor).mobility * (f.actor.react?.speed ?? 1) * (1 - 0.15 * (f.actor.fatigue || 0)) * (1 - 0.25 * (f.unsteady || 0));
  }

  drive(f, movement, dt) {
    if (f.heldBy || f.grapple) return;
    if (this.time < f.staggerUntil) return;
    const dx = clamp(Number(movement.x) || 0, -1, 1);
    const dy = clamp(Number(movement.y) || 0, -1, 1);
    if (!dx && !dy) return;
    const len = Math.max(1, Math.hypot(dx, dy));
    const step = this.speedOf(f, this.tune.speed) * dt;
    // Note: item 346: a drunk man's walk wanders off the line he means.
    const swing = lurch(f.unsteady || 0, this.time, 2.3);
    const mx = (dx / len) * Math.cos(swing) - (dy / len) * Math.sin(swing);
    const my = (dx / len) * Math.sin(swing) + (dy / len) * Math.cos(swing);
    const moved = this.moveBy(f, mx * step, my * step);
    if (moved > 0 && !(f.drawn && this.nearest(f))) f.actor.facing = Math.atan2(dy, dx);
  }

  // Note: along a route to the door; the fight's walk-out for a runner and for a sheriff who withdraws.
  walkOut(f, dt, movement) {
    if (f.withdrawing && f === this.player && (movement.x || movement.y)) {
      f.leaving = false;
      f.withdrawing = false;
      this.event('stay', `${f.name} turns back.`, { who: f.id });
      return;
    }
    if (f.heldBy) return;
    const door = { x: this.room.doorX + 0.5, y: this.room.h - 0.45 };
    const a = f.actor;
    if (!f.ai.path || this.time - f.ai.pathAt > 1) {
      f.ai.path = this.grid.route(a, door, true) || [door];
      f.ai.pathAt = this.time;
    }
    while (f.ai.path.length && dist(a, f.ai.path[0]) < 0.3) f.ai.path.shift();
    const next = f.ai.path[0] || door;
    const d = dist(a, next);
    const base = f === this.player ? this.tune.speed : this.tune.fleeSpeed;
    const step = Math.min(d, this.speedOf(f, base) * dt);
    if (d > 1e-6) {
      a.facing = Math.atan2(next.y - a.y, next.x - a.x);
      this.moveBy(f, ((next.x - a.x) / d) * step, ((next.y - a.y) / d) * step, true);
    }
    if (a.y >= this.room.h - 0.7) {
      f.gone = true;
      f.leaving = false;
      if (f.withdrawing) {
        f.exit = 'fled';
        this.event('left', `${f.name} leaves the fight.`, { who: f.id });
      }
    }
  }

  // Note: bodies do not overlap; a pair pushes apart unless the push would drive one into the furniture.
  separate() {
    const live = this.fighters.filter((f) => f.present && !f.gone);
    const min = RADIUS * 2 + 0.02;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        // Note: a body on the floor is stepped over, never walked around, so no one can be blocked by it.
        if (a.actor.status !== 'ok' || b.actor.status !== 'ok') continue;
        if ((a.grapple && a.grapple.target === b.id) || (b.grapple && b.grapple.target === a.id)) continue;
        const dx = b.actor.x - a.actor.x;
        const dy = b.actor.y - a.actor.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const ux = d > 1e-6 ? dx / d : 1;
        const uy = d > 1e-6 ? dy / d : 0;
        const push = (min - d) / 2;
        this.nudge(a, -ux * push, -uy * push);
        this.nudge(b, ux * push, uy * push);
      }
    }
  }

  nudge(f, dx, dy) {
    const a = f.actor;
    const leaving = f.leaving;
    if (!this.grid.solid(a.x + dx, a.y, RADIUS, leaving)) a.x += dx;
    if (!this.grid.solid(a.x, a.y + dy, RADIUS, leaving)) a.y += dy;
  }

  pickTarget(f) {
    const foes = this.foes(f);
    if (!foes.length) return null;
    const score = (o) => dist(o.actor, f.actor) - (o.id === this.spec.targetId ? 0.6 : 0) - (o.drawn ? 1.5 : 0) - (f.ai.revenge === o.id ? 1 : 0) + (o.heldBy && o.heldBy !== f.id ? 0.6 : 0);
    let best = foes[0];
    for (const o of foes) if (score(o) < score(best)) best = o;
    const keep = foes.find((o) => o.id === f.ai.targetId);
    const pick = keep && score(keep) <= score(best) + 1 ? keep : best;
    f.ai.targetId = pick.id;
    return pick;
  }

  // Note: a drawn gun on the other side in plain view.
  threatOn(f) {
    return this.foes(f).some((o) => o.drawn && o.drawT <= 0 && this.weaponOf(o)?.loaded > 0 && dist(o.actor, f.actor) <= this.tune.gunRange * 1.3);
  }

  think(f, dt) {
    const ai = f.ai;
    if (f.heldBy) {
      ai.struggleT -= dt;
      if (ai.struggleT <= 0) {
        ai.struggleT = 0.5;
        this.struggle(f);
      } else if (this.random.chance(this.tune.breakAuto * dt)) {
        const holder = this.byId(f.heldBy);
        if (holder) this.release(holder);
      }
      return;
    }
    if (this.time < f.staggerUntil) return;
    ai.t -= dt;
    const decide = ai.t <= 0;
    if (decide) ai.t = ai.react * (0.8 + 0.4 * this.random.next());
    const foe = this.pickTarget(f);
    if (!foe) return;
    const d = dist(foe.actor, f.actor);
    if (f.grapple) {
      this.face(f, foe);
      if (f.side === 'aggressor') {
        const held = this.byId(f.grapple.target);
        if (held && f.cooldown <= 0 && ai.pins < this.tune.pins) {
          ai.pins++;
          this.punch(f, held);
        } else if (ai.pins >= this.tune.pins && f.cooldown <= 0) this.release(f);
      }
      return;
    }
    if (decide && this.mayQuit(f, d)) return;
    if (this.thinkGun(f, foe, d, decide, dt)) return;
    if (d > this.tune.reach * 0.8) {
      this.advance(f, foe, dt);
      return;
    }
    this.face(f, foe);
    if (f.cooldown > 0) return;
    if (decide && !foe.heldBy && !foe.grapple && this.random.chance(f.side === 'aggressor' ? 0.1 * f.temper : 0.1)) {
      this.grapple(f, foe);
      return;
    }
    if (this.random.chance(1 - Math.exp(-1.6 * (0.5 + f.temper) * dt))) this.punch(f, foe);
  }

  // Note: true while the fighter is busy with a gun; a defender answers a drawn gun in kind and puts it away once the other side has.
  thinkGun(f, foe, d, decide, dt) {
    const ai = f.ai;
    const weapon = this.weaponOf(f);
    const t = this.tune;
    if (!f.drawn) {
      if (!decide || !this.armed(f)) return false;
      const losing = f.daze > 0.5 * f.toughness && this.random.chance(1 - Math.exp(-t.desperate * f.temper * ai.react));
      const escalate = f.side === 'aggressor' && (this.time >= f.escalationAt || losing);
      const answer = this.threatOn(f) && this.random.chance(1 - Math.exp(-t.respond * (0.4 + 0.6 * f.nerve) * ai.react));
      return (escalate || answer) && this.draw(f);
    }
    if (f.drawT > 0) return true;
    if (!this.armed(f)) {
      this.holster(f);
      return false;
    }
    // Note: a defender shoots only at a man whose gun is out, and puts his own away once nobody's is.
    let mark = foe;
    if (f.side === 'defender') {
      const armedFoes = this.foes(f).filter((o) => o.drawn).sort((a, b) => dist(a.actor, f.actor) - dist(b.actor, f.actor));
      ai.calm = armedFoes.length ? 0 : ai.calm + dt;
      if (ai.calm >= t.calm) {
        this.holster(f);
        ai.calm = 0;
        return false;
      }
      mark = armedFoes[0];
      if (!mark) return false;
    }
    const range = dist(mark.actor, f.actor);
    if (weapon.loaded > 0) {
      if (range > t.gunRange) {
        this.advance(f, mark, dt);
        return true;
      }
      this.face(f, mark);
      if (this.time >= ai.fireAt && !f.reloading && this.fire(f, mark)) ai.fireAt = this.time + WEAPONS[weapon.id].cycle + this.random.range(0.15, 0.6) * (1.3 - f.handling);
      return true;
    }
    if (d <= t.reach * 1.3) {
      this.holster(f);
      return false;
    }
    if (!f.reloading) this.reload(f);
    this.face(f, foe);
    return true;
  }

  // Note: a bystander or an aggressor can lose heart: hurt, outnumbered, outgunned, or simply tired of it; the sheriff's side never quits.
  mayQuit(f, d) {
    if (f.crew || f === this.player || f.exit) return false;
    const t = this.tune;
    const hurt = f.daze / f.toughness;
    const mine = this.fighters.filter((o) => o.side === f.side && this.active(o)).length;
    const theirs = this.fighters.filter((o) => o.side !== f.side && (this.active(o) || this.pending(o))).length;
    let rate = 0.01 + 0.4 * Math.max(0, hurt - 0.4) * (1.1 - f.grit);
    if (mine < theirs) rate += 0.06 * (1.1 - f.grit);
    if (!f.drawn && d <= 6 && this.threatOn(f)) rate += 0.5 * (1 - f.grit);
    if (this.time >= f.quitAt) rate = 99;
    if (!this.random.chance(1 - Math.exp(-rate * f.ai.react))) return false;
    this.quit(f, this.random.chance(t.surrender) ? 'surrendered' : 'fled');
    return true;
  }

  advance(f, foe, dt) {
    const a = f.actor;
    const goal = foe.actor;
    const ai = f.ai;
    let target = goal;
    if (!this.grid.clear(a.x, a.y, goal.x, goal.y)) {
      if (!ai.path || ai.pathFor !== foe.id || this.time - ai.pathAt > 0.5) {
        ai.path = this.grid.route(a, goal);
        ai.pathAt = this.time;
        ai.pathFor = foe.id;
      }
      while (ai.path && ai.path.length > 1 && dist(a, ai.path[0]) < 0.35) ai.path.shift();
      if (ai.path && ai.path.length) target = ai.path[0];
    } else ai.path = null;
    const d = dist(a, target);
    if (d < 1e-6) return;
    a.facing = Math.atan2(target.y - a.y, target.x - a.x);
    const step = Math.min(d, this.speedOf(f, this.tune.aiSpeed) * dt);
    this.moveBy(f, ((target.x - a.x) / d) * step, ((target.y - a.y) / d) * step);
  }

  poseOf(f) {
    const s = f.actor.status;
    if (s === 'dead') return 'dead';
    if (s !== 'ok') return 'down';
    if (f.exit === 'surrendered') return 'surrender';
    if (f.leaving || f.exit === 'fled') return 'flee';
    if (f.heldBy) return 'held';
    if (f.grapple) return 'grapple';
    if (this.time - f.hitAt < 0.35) return 'hit';
    if (this.time < f.staggerUntil) return 'stagger';
    if (this.time - f.punchAt < 0.3) return 'punch';
    if (this.time - f.shotAt < 0.15) return 'fire';
    if (f.reloading) return 'reload';
    if (f.drawT > 0) return 'draw';
    if (f.drawn) return 'aim';
    return f.moving ? 'walk' : 'guard';
  }

  // Note: how far from beaten a fighter is, 0 fresh to 1 out; the fight's own measure, shown to the player.
  strain(f) {
    if (f.actor.status !== 'ok') return 1;
    return clamp(f.daze / f.toughness, 0, 1);
  }

  // Note: what the player can do right now; the HUD greys out the rest, and a press on a greyed action does nothing.
  options(f = this.player) {
    const off = { punch: false, grapple: false, release: false, draw: false, holster: false, fire: false, reload: false, withdraw: false, struggle: false, aim: false };
    if (!f || !this.active(f) || this.done) return off;
    const weapon = this.weaponOf(f);
    const t = this.tune;
    const held = !!f.heldBy;
    const free = !held && !f.leaving;
    const punch = free && !f.grapple && f.cooldown <= 0 && !!this.inReach(f, t.reach);
    const grab = this.inReach(f, t.grabReach);
    const ready = free && !f.grapple && f.drawn && f.drawT <= 0;
    return {
      punch: held || punch,
      grapple: held || (free && (!!f.grapple || (f.cooldown <= 0 && !!grab && !grab.heldBy && !grab.grapple))),
      release: !!f.grapple,
      draw: free && !f.grapple && !f.drawn && this.armed(f),
      holster: !!f.drawn && !held,
      fire: ready && !(f.actor.react && this.time < f.actor.react.t0 + f.actor.react.noFire) && !!weapon && weapon.loaded > 0 && this.foes(f).length > 0,
      reload: ready && !f.reloading && !!weapon && this.reserveOf(f) > 0 && weapon.loaded < WEAPONS[weapon.id].cap,
      withdraw: !held,
      struggle: held,
      aim: ready && this.foes(f).length > 1,
    };
  }

  // Note: plain data for the view and for tests; nothing in it points back into the sim.
  snapshot() {
    return {
      time: this.time,
      done: this.done,
      result: this.result,
      escalated: this.escalated,
      player: this.player ? this.player.id : null,
      aim: this.aimId,
      fighters: this.fighters.map((f) => ({
        id: f.id, name: f.name, side: f.side, crew: f.crew, x: f.actor.x, y: f.actor.y, facing: f.actor.facing,
        status: f.actor.status, exit: f.exit, present: f.present, gone: f.gone, pose: this.poseOf(f),
        heldBy: f.heldBy, holding: f.grapple ? f.grapple.target : null, drawn: f.drawn,
        loaded: this.weaponOf(f) ? this.weaponOf(f).loaded : 0, reserve: this.reserveOf(f), armed: !!this.weaponOf(f), strain: this.strain(f),
        wounds: f.actor.wounds.filter((w) => !w.old).length, fatal: f.actor.wounds.some((w) => w.fatal), travel: f.travel, look: f.look, region: f.hitRegion, reloading: !!f.reloading,
        since: { punch: this.time - f.punchAt, hit: this.time - f.hitAt, shot: this.time - f.shotAt, fell: f.fellAt == null ? null : this.time - f.fellAt },
      })),
      lastEvent: this.lastEvent,
    };
  }

  report() {
    if (!this.done) return null;
    return {
      result: this.result,
      seconds: Math.max(0.05, this.time),
      escalated: this.escalated,
      fighters: this.fighters.map((f) => ({
        id: f.id, status: f.actor.status, exit: f.exit, arrived: f.present, roundsFired: f.roundsFired,
        wounds: f.actor.wounds.filter((w) => !w.old).map((w) => ({ region: w.region, side: w.side, severity: Math.min(1, w.severity), fatal: !!w.fatal })),
      })),
    };
  }
}
