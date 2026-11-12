// Note: the saloon's real-time life mode; pure, deterministic from the visit seed, and it never touches money, the clock or the save.
import { rng, seedFromString } from '../rand.js';
import { RADIUS } from '../config.js';
import { makeName, GROUPS } from './names.js';
import { reachable, usable, rectDist, REACH, cellIndex, offerOf, PRICES } from './saloon-room.js';
import { PATRON_KINDS } from '../people.js';
import { lurch } from './drink.js';

export const SHERIFF_SPEED = 2.2;
export const PATRON_SPEED = 0.7;
// Note: how far from a patron's edge the sheriff may be to talk to them.
export const TALK_REACH = 1.0;
const STEP = 0.05;
const MEN = PATRON_KINDS.men;
const WOMEN = PATRON_KINDS.women;
const NOUN = PATRON_KINDS.nouns;
// Note: the stands round the billiard table and the barrel tables, where a patron leans on the furniture.
export const isLounge = (slot) => /^(pool|tub)-/.test(slot.id);

const sexOfName = (name) => {
  const first = String(name).split(/\s+/)[0];
  const female = Object.values(GROUPS).some((g) => g.f.includes(first));
  const male = Object.values(GROUPS).some((g) => g.m.includes(first));
  return female && !male ? 'f' : 'm';
};

const actor = (o) => ({ role: 'civilian', stance: 'stand', status: 'ok', wounds: [], weapons: [], cur: 0, lean: 0, pose: 'stand', dist: 0, moving: false, facing: 0, mode: 'stand', path: null, timer: 0, wait: 0, gestureUntil: 0, ...o });

export class SaloonScene {
  // Note: opts: seed (the visit seed), patron (the name enter() gave), crew (people to seat), crowd (patron count, 7 to 11 when not given), offer (Campaign.saloon()).
  constructor(room, opts = {}) {
    this.room = room;
    this.seed = opts.seed ?? 0;
    // Note: item 346: the sheriff's drink, 0 to 1; it makes his walk unsteady and is set again after each glass.
    this.drunk = opts.drunk || 0;
    this.offer = { ...offerOf(opts.offer || room.offer), prices: opts.offer?.prices || { ...PRICES } };
    this.map = room.map;
    this.time = 0;
    this.stake = 25;
    this.last = null;
    this.context = null;
    this.lock = false;
    this.carry = 0;
    // Note: calm turns off the idle wandering and gestures (prefers-reduced-motion); the sheriff still walks.
    this.calm = !!opts.calm;
    this.R = rng(seedFromString(`saloon-scene:${this.seed}`));
    this.sheriff = actor({ id: 'sheriff', role: 'sheriff', kind: 'sheriff', name: 'You', x: room.spawn.x, y: room.spawn.y, facing: room.spawn.facing });
    this.actors = [];
    this.held = new Map();
    this.populate(opts);
    this.pick();
  }

  populate(opts) {
    const { room, R } = this;
    const taken = new Set();
    const name = (sex, given) => {
      if (given) {
        taken.add(given.toLowerCase());
        return { name: given, sex: sexOfName(given) };
      }
      const made = makeName(R, { use: 'any', sex, taken });
      taken.add(made.name.toLowerCase());
      return { name: made.name, sex: made.sex };
    };
    const add = (o) => {
      const a = actor(o);
      this.actors.push(a);
      return a;
    };
    const bartender = name('m');
    const bx = R.int(room.bar.strip.x0, room.bar.strip.x1);
    add({ id: 'barkeep', kind: 'barkeep', name: bartender.name, sex: 'm', x: bx + 0.5, y: 2.5, facing: Math.PI / 2, mode: 'tend', timer: R.range(3, 9), home: null });
    if (room.piano) {
      const who = name('m');
      const seat = room.piano.stool;
      const a = add({ id: 'pianist', kind: 'pianist', name: who.name, sex: 'm', x: seat.x, y: seat.y, facing: seat.facing, mode: 'seated', home: seat.id, pose: 'play', timer: R.range(5, 12) });
      this.held.set(seat.id, a.id);
    }
    const places = [];
    for (const s of room.seats) if (s.kind === 'chair') places.push({ type: 'seat', slot: s });
    for (const s of room.stands) if (s.safe && s.kind !== 'piano') places.push({ type: 'stand', slot: s });
    R.shuffle(places);
    // Note: about two in three of the billiard and barrel spots are taken first, so the lounge has company when the crowd is large.
    const lively = places.filter((pl) => pl.type === 'stand' && isLounge(pl.slot) && R.chance(0.65));
    places.splice(0, places.length, ...lively, ...places.filter((pl) => !lively.includes(pl)));
    const crew = (opts.crew || []).slice(0, 4).map((c, i) => ({ crew: true, person: c, look: i % 4 }));
    const crowd = Math.max(0, Math.min(opts.crowd ?? R.int(7, 11), places.length));
    const patrons = [];
    if (opts.patron) patrons.push({ given: opts.patron });
    while (patrons.length < crowd) patrons.push({});
    const who = [...crew, ...patrons];
    for (const p of who) {
      const slot = places.find((pl) => this.canTake(pl));
      if (!slot) break;
      places.splice(places.indexOf(slot), 1);
      const named = p.crew ? { name: p.person.name || 'A friend', sex: 'm' } : name(R.chance(0.28) ? 'f' : 'm', p.given);
      const kind = p.crew ? 'deputy' : R.weighted(named.sex === 'f' ? WOMEN : MEN);
      const a = add({ id: p.crew ? `crew-${p.person.id ?? this.actors.length}` : `patron-${this.actors.length}`, role: p.crew ? 'deputy' : 'civilian', look: p.look || 0, kind, name: named.name, sex: named.sex, crew: !!p.crew, restless: R.chance(0.35), timer: R.range(1, 8) });
      this.settle(a, slot);
    }
    if (room.piano && R.chance(0.6)) {
      const st = room.stands.find((s) => s.kind === 'piano' && s.free);
      if (st) {
        const named = name('f');
        const a = add({ id: 'singer', kind: 'singer', name: named.name, sex: 'f', timer: R.range(3, 9) });
        this.settle(a, { type: 'stand', slot: st });
      }
    }
  }

  // Note: a place is takeable when no one holds it and, for a stand, every target stays usable with it held.
  canTake(place) {
    if (this.held.has(place.slot.id)) return false;
    if (place.type === 'seat') return true;
    return this.keepsOpen(place.slot.cell);
  }

  keepsOpen(cell) {
    const extra = [cell.y * this.room.w + cell.x];
    for (const a of this.actors) if (a.mode === 'stand' || a.mode === 'bar') extra.push(cellIndex(this.room, a.x, a.y));
    for (const [id] of this.held) {
      const st = this.room.stands.find((s) => s.id === id);
      if (st) extra.push(st.cell.y * this.room.w + st.cell.x);
    }
    const seen = reachable(this.room, extra);
    return this.room.targets.every((t) => usable(this.room, seen, t));
  }

  settle(a, place) {
    const s = place.slot;
    a.home = s.id;
    a.x = s.x;
    a.y = s.y;
    a.facing = s.facing;
    a.mode = place.type === 'seat' ? 'seated' : s.kind === 'bar' ? 'bar' : 'stand';
    a.leaning = a.mode === 'bar' || (a.mode === 'stand' && isLounge(s));
    a.pose = a.mode === 'seated' ? (s.table?.startsWith('poker') || s.table?.startsWith('faro') ? 'cards' : 'sit') : a.leaning ? 'lean' : 'stand';
    a.path = null;
    this.held.set(s.id, a.id);
  }

  actorById(id) {
    return id === 'sheriff' ? this.sheriff : this.actors.find((a) => a.id === id) || null;
  }

  // Note: a plain line for the live region, such as "Jack Hollis, a miner, sits at the faro table".
  describe(a) {
    const noun = NOUN[a.kind] || 'a patron';
    const where = a.mode === 'seated' ? (a.pose === 'cards' ? ', playing cards' : ', seated') : a.mode === 'bar' ? ', at the bar' : a.path ? ', walking' : '';
    return `${a.name}, ${noun}${where}`;
  }

  // Note: true when a circle at (x, y) touches a wall, a piece of furniture or a chair.
  blocked(x, y, r = RADIUS) {
    const { room } = this;
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
        const out = cx < 0 || cy < 0 || cx >= room.w || cy >= room.h;
        if ((out || room.blocked[cy * room.w + cx]) && rectDist({ x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 }, x, y) < r) return true;
      }
    }
    return false;
  }

  // Note: a cell path for patrons, 8 ways with no corner cutting; the goal may be a chair; avoid lists cells to treat as walls.
  route(from, goal, avoid = []) {
    const { room } = this;
    const { w, h } = room;
    const skip = new Set(avoid);
    const start = cellIndex(room, from.x, from.y);
    const end = cellIndex(room, goal.x, goal.y);
    const open = (i) => i === end || (!room.blocked[i] && !skip.has(i));
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
        if (dx && dy && (room.blocked[y * w + nx] || room.blocked[ny * w + x])) continue;
        prev.set(n, c);
        todo.push(n);
      }
    }
    if (!prev.has(end)) return null;
    const cells = [];
    for (let c = end; c !== start; c = prev.get(c)) cells.push(c);
    cells.reverse();
    // Note: a goal in the start cell still needs one step, so a path is never empty.
    if (!cells.length) return [{ x: goal.x, y: goal.y }];
    const path = cells.map((c) => ({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 }));
    path[path.length - 1] = { x: goal.x, y: goal.y };
    return path;
  }

  // Note: input is {x, y} in -1..1; dt is seconds; the world advances in fixed 0.05 s steps so it does not depend on the frame rate.
  step(dt, input = {}) {
    if (!(dt > 0)) return;
    this.carry += Math.min(dt, 0.5);
    while (this.carry >= STEP - 1e-9) {
      this.carry -= STEP;
      this.tick(STEP, input);
    }
  }

  tick(dt, input) {
    this.time += dt;
    this.move(dt, input);
    for (const a of this.actors) this.think(a, dt);
    this.pick();
  }

  move(dt, input) {
    const s = this.sheriff;
    const ix = Math.max(-1, Math.min(1, Number(input.x) || 0));
    const iy = Math.max(-1, Math.min(1, Number(input.y) || 0));
    const len = Math.max(1, Math.hypot(ix, iy));
    const swing = lurch(this.drunk, this.time, 2.1);
    const speed = SHERIFF_SPEED * (1 - 0.3 * this.drunk);
    const vx = ((ix * Math.cos(swing) - iy * Math.sin(swing)) / len) * speed * dt;
    const vy = ((ix * Math.sin(swing) + iy * Math.cos(swing)) / len) * speed * dt;
    const px = s.x;
    const py = s.y;
    if (vx && !this.blocked(s.x + vx, s.y)) s.x += vx;
    if (vy && !this.blocked(s.x, s.y + vy)) s.y += vy;
    const moved = Math.hypot(s.x - px, s.y - py);
    s.moving = moved > 1e-6;
    if (s.moving) {
      s.dist += moved;
      s.facing = Math.atan2(s.y - py, s.x - px);
      s.pose = 'walk';
      s.poseUntil = 0;
    } else if (!s.poseUntil || this.time >= s.poseUntil) {
      s.pose = 'stand';
    }
  }

  think(a, dt) {
    if (a.mode === 'tend') return this.tend(a, dt);
    if (a.talkUntil && this.time >= a.talkUntil) a.talkUntil = 0;
    if (a.path) return this.follow(a, dt);
    a.moving = false;
    if (a.talkUntil) {
      a.facing = Math.atan2(this.sheriff.y - a.y, this.sheriff.x - a.x);
      return;
    }
    a.timer -= dt;
    if (a.timer > 0) return;
    if (a.mode === 'stray') {
      this.wander(a);
      if (!a.path) a.timer = 2;
      return;
    }
    this.decide(a);
  }

  // Note: the bartender polishes a glass, now and then steps along the strip, and turns to the shelves.
  tend(a, dt) {
    const strip = this.room.bar.strip;
    if (a.path) return this.follow(a, dt);
    a.moving = false;
    a.timer -= dt;
    if (a.timer > 0) return;
    const roll = this.R.next();
    a.timer = this.R.range(4, 10);
    if (this.calm) {
      a.pose = 'wipe';
    } else if (roll < 0.45) {
      const x = this.R.int(strip.x0, strip.x1) + 0.5;
      if (Math.abs(x - a.x) > 0.6) a.path = [{ x, y: 2.5 }];
      a.pose = 'wipe';
    } else if (roll < 0.65) {
      a.facing = -Math.PI / 2;
      a.pose = 'stand';
    } else {
      a.facing = Math.PI / 2;
      a.pose = 'wipe';
    }
  }

  decide(a) {
    const { R } = this;
    const roll = R.next();
    a.timer = R.range(4, 11);
    if (a.kind === 'pianist') {
      a.pose = 'play';
      return;
    }
    if (this.calm) return;
    const restless = a.restless ? 0.34 : 0.1;
    if (roll < 0.5) {
      a.gestureUntil = this.time + 1.6;
      a.gesture = 'drink';
    } else if (roll < 0.5 + restless) {
      this.wander(a);
    } else if (roll < 0.8 && a.mode !== 'seated') {
      a.facing += R.range(-0.9, 0.9);
    }
  }

  wander(a) {
    const { room } = this;
    const choices = [];
    for (const s of room.seats) if (s.kind === 'chair') choices.push({ type: 'seat', slot: s });
    for (const s of room.stands) if (s.safe && s.kind !== 'piano') choices.push({ type: 'stand', slot: s });
    this.R.shuffle(choices);
    const here = a.home;
    const mine = this.held.get(here) === a.id;
    if (mine) this.held.delete(here);
    for (const place of choices.slice(0, 6)) {
      if (place.slot.id === here || !this.canTake(place)) continue;
      const path = this.route({ x: a.x, y: a.y }, { x: place.slot.x, y: place.slot.y });
      if (!path) continue;
      a.path = path;
      a.dest = place;
      a.wait = 0;
      this.held.set(place.slot.id, a.id);
      return;
    }
    if (mine) this.held.set(here, a.id);
  }

  follow(a, dt) {
    const next = a.path[0];
    const hold = (a.kind === 'barkeep' ? 0.9 : PATRON_SPEED) * dt;
    const dx = next.x - a.x;
    const dy = next.y - a.y;
    const d = Math.hypot(dx, dy);
    const nx = d > 1e-6 ? a.x + (dx / d) * Math.min(hold, d) : a.x;
    const ny = d > 1e-6 ? a.y + (dy / d) * Math.min(hold, d) : a.y;
    a.wait = 0;
    const stepped = Math.hypot(nx - a.x, ny - a.y);
    if (stepped > 0) a.facing = Math.atan2(ny - a.y, nx - a.x);
    a.x = nx;
    a.y = ny;
    a.dist += stepped;
    a.moving = true;
    a.pose = 'walk';
    if (d <= hold + 1e-6) {
      a.path.shift();
      if (!a.path.length) this.arrive(a);
    }
  }

  // Note: a patron that cannot get through goes back to a free place nearby on the next decision.
  giveUp(a) {
    a.path = null;
    a.moving = false;
    a.wait = 0;
    if (a.kind === 'barkeep') return;
    if (a.dest && this.held.get(a.dest.slot.id) === a.id) this.held.delete(a.dest.slot.id);
    a.dest = null;
    a.home = null;
    a.mode = 'stray';
    a.timer = 1;
  }

  arrive(a) {
    a.path = null;
    a.moving = false;
    a.wait = 0;
    if (a.kind === 'barkeep') {
      a.pose = 'wipe';
      return;
    }
    if (a.dest) {
      this.settle(a, a.dest);
      a.dest = null;
    }
    a.timer = this.R.range(5, 12);
  }

  // Note: everything the sheriff could use right now: the door, the bar, the game tables the town offers, and every person.
  targets() {
    const list = [];
    for (const t of this.room.targets) {
      const actions = this.actionsOf(t);
      if (!actions.length) continue;
      const cx = Math.max(t.rect.x0, Math.min(this.sheriff.x, t.rect.x1));
      const cy = Math.max(t.rect.y0, Math.min(this.sheriff.y, t.rect.y1));
      list.push({ id: t.id, kind: t.kind, game: t.game, label: t.label, rect: t.rect, actions, at: { x: cx, y: cy }, reach: REACH, distance: rectDist(t.rect, this.sheriff.x, this.sheriff.y) });
    }
    for (const a of this.actors) {
      if (a.kind === 'barkeep') continue;
      const distance = Math.max(0, Math.hypot(a.x - this.sheriff.x, a.y - this.sheriff.y) - RADIUS);
      list.push({ id: a.id, kind: 'person', label: a.name, actor: a, actions: [{ id: 'talk', label: 'Talk' }], at: { x: a.x, y: a.y }, reach: TALK_REACH, distance });
    }
    return list;
  }

  actionsOf(t) {
    const { offer } = this;
    if (t.kind === 'door') return [{ id: 'leave', label: 'Leave the saloon' }];
    if (t.kind === 'bar') return [{ id: 'drink', label: 'Have a drink', price: offer.prices.drink }, ...(offer.meal ? [{ id: 'meal', label: 'Have a meal', price: offer.prices.meal }] : [])];
    if (t.kind === 'game') return offer.games.includes(t.game) ? [{ id: 'play', label: t.game === 'faro' ? 'Play faro' : 'Play poker', game: t.game, stake: true }] : [];
    return [];
  }

  // Note: the nearest usable target, with a little stickiness so the prompt does not flicker between two.
  nearest() {
    let best = null;
    for (const t of this.targets()) {
      if (t.distance > t.reach) continue;
      const bonus = this.context && this.context.id === t.id ? 0.18 : 0;
      // Note: a card player counts as part of the table, so the table in front of the sheriff wins unless the player is much nearer.
      // Note: the door wins over a patron who happens to stand by it, so the way out is always one key away.
      const score = t.distance - bonus - (t.kind === 'person' ? 0.05 : 0) - (t.kind === 'door' ? 0.4 : 0) + (t.actor && t.actor.pose === 'cards' ? 0.45 : 0);
      if (!best || score < best.score) best = { t, score };
    }
    return best ? best.t : null;
  }

  // Note: while lock is set (a control in the side panel has focus) the chosen target stays chosen as long as it is still in reach.
  pick() {
    if (this.lock && this.context) {
      const same = this.targets().find((t) => t.id === this.context.id);
      if (same && same.distance <= same.reach + 0.3) {
        this.context = same;
        return same;
      }
    }
    this.context = this.nearest();
    return this.context;
  }

  // Note: asks the Campaign to do the thing, which needs only saloonActivity(action, stake); the scene changes no cash, clock or log.
  act(campaign, actionId, stake) {
    const ctx = this.context;
    const action = ctx && ctx.actions.find((a) => a.id === actionId);
    if (!action) return { ok: false, reason: 'There is nothing like that to do here.' };
    if (action.id === 'leave') return { ok: true, action: 'leave', leave: true };
    const result = campaign.saloonActivity(action.game || action.id, action.stake ? stake ?? this.stake : undefined);
    this.last = { target: ctx.id, action: action.id, result };
    if (result && result.ok) {
      const s = this.sheriff;
      const to = ctx.rect ? { x: (ctx.rect.x0 + ctx.rect.x1) / 2, y: (ctx.rect.y0 + ctx.rect.y1) / 2 } : ctx.at;
      s.facing = Math.atan2(to.y - s.y, to.x - s.x);
      s.pose = action.id === 'talk' ? 'talk' : action.stake ? 'cards' : 'drink';
      s.poseUntil = this.time + 2.2;
      if (ctx.actor) ctx.actor.talkUntil = this.time + 3;
    }
    return result;
  }

  // Note: the pose a person shows right now, with brief gestures (a sip, a nod) laid over the resting pose.
  poseOf(a) {
    if (a.moving) return 'walk';
    if (a.talkUntil) return 'talk';
    if (a.gestureUntil > this.time && a.gesture === 'drink') return 'drink';
    return a.pose;
  }
}
