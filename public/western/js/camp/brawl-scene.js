// Note: the saloon floor during a fight; patrons back off, watch, duck or run for the door, and the barkeep takes cover; it only reads the fight and never changes it.
import { SaloonScene } from './saloon-scene.js';
import { cellIndex } from './saloon-room.js';
import { angleDiff } from '../rand.js';

// Note: how close a standing patron lets a fighter come before stepping aside, and how far from the fight a patron wants to stand.
const CLEAR = 0.95;
const BACK = 3.4;
const RUN = 3.4;
const BACK_SPEED = 2.2;

export class BrawlScene extends SaloonScene {
  // Note: opts: seed (the fight seed, so a restart has the same crowd), crowd (patron count, the saloon's own count when not given), spots (where the fighters start, as {x, y}).
  constructor(room, opts = {}) {
    super(room, { seed: opts.seed, crowd: opts.crowd, crew: [], offer: opts.offer, calm: opts.calm });
    this.fight = null;
    this.spots = (opts.spots || []).map((p) => ({ x: p.x, y: p.y }));
    this.sheriff.gone = true;
    for (const a of this.actors) {
      a.nerve = this.R.next();
      a.alarm = this.R.range(0.2, 1.3);
      a.shaken = false;
      a.fleeing = false;
      a.gone = false;
      a.seatFacing = a.facing;
    }
    this.clearStart();
  }

  // Note: nobody stands on the spot where a fighter starts; they are moved to a free place farther off before the first frame.
  clearStart() {
    if (!this.spots.length) return;
    const mid = this.middle(this.spots);
    for (const a of this.actors) {
      if (a.mode === 'seated' || a.kind === 'barkeep' || a.kind === 'pianist') continue;
      if (!this.spots.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < 1.5)) continue;
      const place = this.farPlace(a, mid, BACK);
      if (place) {
        if (a.home && this.held.get(a.home) === a.id) this.held.delete(a.home);
        this.settle(a, place);
      }
    }
  }

  middle(list) {
    if (!list.length) return { x: this.room.w / 2, y: this.room.h / 2 };
    return { x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length };
  }

  // Note: the nearest free standing place at least `far` metres from the fight, reachable round the furniture.
  farPlace(a, mid, far) {
    const { room } = this;
    const choices = [];
    for (const s of room.stands) if (s.safe && s.kind !== 'piano' && Math.hypot(s.x - mid.x, s.y - mid.y) >= far) choices.push({ type: 'stand', slot: s });
    choices.sort((p, q) => Math.hypot(p.slot.x - a.x, p.slot.y - a.y) - Math.hypot(q.slot.x - a.x, q.slot.y - a.y));
    const statics = this.actors.filter((o) => o !== a && !o.path && !o.gone && (o.mode === 'stand' || o.mode === 'bar')).map((o) => cellIndex(room, o.x, o.y));
    for (const place of choices.slice(0, 8)) {
      if (!this.canTake(place)) continue;
      if (this.route({ x: a.x, y: a.y }, { x: place.slot.x, y: place.slot.y }, statics)) return place;
    }
    return null;
  }

  // Note: the view hands over where the fighters are and whether a gun is out; fighters is a list of {x, y, up} and gun is true once a shot or a draw has been seen.
  watch(fight) {
    this.fight = fight;
    const p = fight.fighters.find((f) => f.player && f.up) || fight.fighters.find((f) => f.player);
    if (p) {
      this.sheriff.x = p.x;
      this.sheriff.y = p.y;
    }
  }

  tick(dt) {
    this.time += dt;
    for (const a of this.actors) if (!a.gone) this.think(a, dt);
  }

  think(a, dt) {
    const f = this.fight;
    if (a.path) {
      this.follow(a, dt * (a.fleeing ? RUN : BACK_SPEED / 0.7));
      return;
    }
    a.moving = false;
    if (!f || !f.fighters.length) return;
    const up = f.fighters.filter((o) => o.up);
    const mid = this.middle(up.length ? up : f.fighters);
    a.alarm -= dt;
    if (a.alarm > 0) return;
    if (f.gun && !a.shaken) {
      a.shaken = true;
      this.shaken(a, mid);
      if (a.path) return;
    }
    const idle = a.kind === 'barkeep' || a.kind === 'pianist';
    if (a.mode !== 'seated' && !idle) {
      const pressed = up.find((o) => Math.hypot(o.x - a.x, o.y - a.y) < CLEAR);
      if (pressed) {
        this.stepAside(a, pressed, dt);
        return;
      }
      if (Math.hypot(mid.x - a.x, mid.y - a.y) < BACK && !a.backed) {
        a.backed = true;
        const place = this.farPlace(a, mid, BACK + 0.4);
        const goal = place && { x: place.slot.x, y: place.slot.y };
        const path = place && (this.route({ x: a.x, y: a.y }, goal, this.fightCells(mid)) || this.route({ x: a.x, y: a.y }, goal));
        if (path) {
          if (a.home && this.held.get(a.home) === a.id) this.held.delete(a.home);
          a.path = path;
          a.dest = place;
          a.wait = 0;
          this.held.set(place.slot.id, a.id);
          return;
        }
      }
    }
    this.watching(a, mid);
  }

  // Note: cells round the middle of the fight, so a path does not run through it.
  fightCells(mid) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(cellIndex(this.room, mid.x + dx, mid.y + dy));
    return out;
  }

  // Note: the first shot or draw: a nervous patron runs for the door, the rest duck where they are.
  shaken(a, mid) {
    if (a.kind === 'barkeep' || a.kind === 'pianist') {
      a.pose = 'cower';
      return;
    }
    if (a.nerve < 0.5) {
      const door = { x: this.room.doorX + 0.5, y: this.room.h - 0.5 };
      const path = this.route({ x: a.x, y: a.y }, door, this.fightCells(mid)) || this.route({ x: a.x, y: a.y }, door);
      if (path) {
        if (a.home && this.held.get(a.home) === a.id) this.held.delete(a.home);
        a.home = null;
        a.dest = null;
        a.fleeing = true;
        a.mode = 'stray';
        a.path = path;
        a.wait = 0;
        a.pose = 'stand';
        return;
      }
    }
    a.pose = 'cower';
  }

  // Note: someone standing too near a fighter gives way, away from them and never into the furniture.
  stepAside(a, from, dt) {
    const dx = a.x - from.x;
    const dy = a.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = BACK_SPEED * dt;
    const nx = a.x + (dx / d) * step;
    const ny = a.y + (dy / d) * step;
    if (!this.blocked(nx, a.y)) a.x = nx;
    if (!this.blocked(a.x, ny)) a.y = ny;
    a.moving = true;
    a.pose = 'walk';
    a.facing = Math.atan2(dy, dx);
  }

  // Note: the rest look on; a seated patron turns in the chair, a standing one turns round.
  watching(a, mid) {
    const to = Math.atan2(mid.y - a.y, mid.x - a.x);
    if (a.pose === 'cower') return;
    if (a.kind === 'barkeep') {
      a.facing = to;
      a.pose = 'stand';
    } else if (a.kind === 'pianist') {
      a.pose = 'stand';
    } else if (a.mode === 'seated') {
      a.facing = a.seatFacing + Math.max(-0.9, Math.min(0.9, angleDiff(a.seatFacing, to)));
      a.pose = 'sit';
    } else {
      a.facing = to;
      a.pose = a.leaning ? 'lean' : 'stand';
    }
  }

  arrive(a) {
    if (a.fleeing) {
      a.path = null;
      a.moving = false;
      a.gone = true;
      return;
    }
    super.arrive(a);
  }

  giveUp(a) {
    if (a.fleeing) {
      // Note: a runner that is boxed in ducks where he stands.
      a.path = null;
      a.moving = false;
      a.fleeing = false;
      a.pose = 'cower';
      return;
    }
    super.giveUp(a);
  }

  poseOf(a) {
    if (a.moving) return 'walk';
    return a.pose;
  }
}
