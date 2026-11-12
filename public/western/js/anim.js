// Note: view-side animation; pure maths plus a per-actor tracker, no DOM or Phaser. The sim stays the source of truth.

import { WEAPONS } from './weapons.js';
import { FLOOR_H } from './config.js';
import { clamp } from './rand.js';
import { hitReaction } from './wounds.js';
import { blastStage } from './dynamite.js';

export const clamp01 = (p) => Math.min(1, Math.max(0, p));
export const ease = (p) => {
  const q = clamp01(p);
  return q * q * (3 - 2 * q);
};
// Note: frame index 0..n-1 for a progress 0..1.
export const phaseOf = (p, n) => Math.min(n - 1, Math.max(0, Math.floor(clamp01(p) * n)));

export const kindOf = (w) => (!w ? 'none' : w.id === 'winchester73' ? 'rifle' : 'handgun');

// Note: stable 0..1 noise from two numbers, so a flinch or a fall side is the same on every machine.
export function hash01(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export const STRIDE = 0.42;
// Note: metres per step frame; a sprint takes long strides and a creep short toe steps.
export const SPRINT_STRIDE = 0.7;
export const CREEP_STRIDE = 0.26;
export const strideOf = (gait) => (gait === 'sprint' ? SPRINT_STRIDE : gait === 'creep' ? CREEP_STRIDE : STRIDE);
export const stepPhaseAt = (dist, stride) => Math.floor(dist / stride) % 4;
export const stepPhase = (dist) => stepPhaseAt(dist, STRIDE);

// Note: the pose key from body language: mode is the actor's gait, stance its posture, pace the sheriff's chosen pace (standing still shows it as a hunch or a ready stance).
export function gaitOf({ mode = 'idle', stance = 'stand', pace } = {}) {
  if (stance === 'crouch') return 'crouch';
  if (mode === 'sprint') return 'sprint';
  if (mode === 'slow') return 'creep';
  if (mode === 'walk') return 'walk';
  if (pace === 'slow') return 'hunch';
  if (pace === 'sprint') return 'ready';
  return 'stand';
}

// Note: only these gaits change the drawn pose; walk, stand and crouch keep the plain one.
export const SPRITE_GAITS = new Set(['sprint', 'creep', 'hunch', 'ready']);
export const spriteGait = (g) => (SPRITE_GAITS.has(g) ? g : '');

// Note: Winchester loads one round per 4 frames; the Colt first ejects (frames 4..7), then loads (0..3).
export function reloadFrame(action, kind) {
  const st = (action && action.state) || {};
  const p = st.dur > 0 && Number.isFinite(st.dur) ? st.t / st.dur : 0;
  return { act: 'reload', ph: phaseOf(p, 4) + (st.phase === 'eject' && kind === 'handgun' ? 4 : 0) };
}

// Note: draw and sling in three beats; the old weapon goes away, hands are empty, the new one comes up.
export function switchFrame(action, oldKind, newKind) {
  const p = action && action.dur > 0 ? action.t / action.dur : 0;
  const ph = phaseOf(p, 3);
  return { act: 'switch', ph, weapon: ph === 0 ? oldKind : ph === 1 ? 'none' : newKind, stow: ph === 1 ? oldKind : '' };
}

// Note: after a shot the weapon cycles for weapon.cycle seconds: kick, then lever work or hammer.
export function cycleFrame(kind, since, cycle) {
  if (kind === 'none' || since < 0 || since >= cycle) return null;
  const p = since / cycle;
  const kick = kind === 'rifle' ? 0.13 : 0.18;
  if (p < kick) return { act: 'recoil', ph: 0, p };
  if (p >= 0.8) return null;
  if (kind === 'rifle') return { act: 'lever', ph: phaseOf((p - kick) / (0.8 - kick), 3), p };
  return { act: 'cock', ph: 0, p };
}

// Note: how far a shot pushes the body back, in game pixels.
export const kickBack = (since, cycle) => (since >= 0 && since < cycle * 0.2 ? 1.6 * (1 - since / (cycle * 0.2)) : 0);

// Note: forcing a door or window is one thud every STRIKE_PERIOD seconds; until is the sim's countdown to the next.
// Note: item 499: the dynamite throw as poses: 0 gun to the holster, 1 bundle out of the coat, 2 and 7 the match struck and flaring, 3 the fuse lit,
// Note: 4 the arm drawn back, 5 the throw, 6 the gun drawn again; the body sways back for the wind-up and forward into the throw.
export const BLAST_PH = Object.freeze({ stow: 0, draw: 1, strike: 2, light: 3, windup: 4, release: 5, redraw: 6 });
export function blastFrame(b, kind, face = 0) {
  const st = blastStage(b);
  const f = { act: 'dyn', ph: BLAST_PH[st.stage], weapon: 'none', stow: kind === 'none' ? '' : kind, ox: 0, oy: 0 };
  if (st.stage === 'strike' && st.p >= 0.45) f.ph = 7;
  // Note: half way through holstering and the last part of the draw the gun is still in hand, low.
  if ((st.stage === 'stow' && st.p < 0.5) || (st.stage === 'redraw' && st.p > 0.6)) {
    f.weapon = kind;
    f.stow = '';
    f.ph = 8;
  }
  const lean = st.stage === 'windup' ? -1.4 * st.p : st.stage === 'release' ? 1.6 * (1 - st.p * 0.5) : 0;
  f.ox = Math.cos(face) * lean;
  f.oy = Math.sin(face) * lean;
  return f;
}

export const STRIKE_PERIOD = 0.9;
export function breachFrame(until) {
  const since = STRIKE_PERIOD - until;
  let ph = 3;
  if (until <= 0.22) ph = 1;
  else if (until <= 0.45) ph = 0;
  else if (since >= 0 && since < 0.12) ph = 2;
  const shake = until > 0.45 && since >= 0 && since < 0.25 ? 1 - since / 0.25 : 0;
  return { ph, shake, struck: until > STRIKE_PERIOD - 0.05 };
}

// Note: a window climb is sill, astride, land; the sim moves the actor only at the end, so the view slides it across.
export function vaultFrame(action) {
  const p = action && action.dur > 0 ? clamp01(action.t / action.dur) : 0;
  return { act: 'vault', ph: p < 0.3 ? 0 : p < 0.7 ? 1 : 2, p, scale: 1 + 0.1 * Math.sin(Math.PI * p), slide: ease(p) };
}

// Note: on the flight the body follows height and heading: dir is +1 going up and -1 going down by the last step taken, p is the climb 0..1, and the steep run takes short strides.
export const FLIGHT_STRIDE = 0.7;
export function flightFrame(a, heading = 0) {
  // Note: the climb is measured from the flight's lower floor: a positive elev stands on it, a negative one below the upper floor.
  const e = a.elev || 0;
  const p = clamp01(e > 0 ? e / FLOOR_H : e < 0 ? 1 + e / FLOOR_H : a.floor ? 1 : 0);
  return { p, dir: heading < 0 ? 1 : heading > 0 ? -1 : 0, stride: FLIGHT_STRIDE, bob: 0.35 * Math.sin(p * Math.PI * 10) };
}

// Note: metres above the floor the viewer stands on; the sim moves the climber, so lift and size follow elev.
export const heightOf = (a, viewFloor) => (a.floor - viewFloor) * FLOOR_H + (a.elev || 0);
export const heightScale = (rel) => clamp(1 + 0.06 * rel, 0.82, 1.18);
export const heightLift = (rel) => -0.7 * clamp(rel, -3, 3);

// Note: how dark the picture dips around the floor change while the followed character is on the flight; p is the climb 0..1.
export const stairsShade = (p) => 0.6 * Math.exp(-(((p - 0.5) / 0.15) ** 2));

// Note: the lying body is lifted onto the carrier's shoulders over the pickup action; p is 0..1, the sheriff turns across the carrier and slides under the load.
export const LIFT_UP = 0.6;
export function liftFrame(action) {
  const p = action && action.dur > 0 ? clamp01(action.t / action.dur) : 0;
  const e = ease(p);
  return { p, up: p >= LIFT_UP, slide: e, turn: e, scale: 1 + 0.08 * Math.sin(Math.PI * p) };
}

// Note: putting the body down is the pickup played backwards over this long; the run length only sets the scale of liftFrame's clock.
export const LOWER_T = 0.8;
const LIFT_RUN = 1.5;

// Note: how the carried body shows in the carrier's own picture: limp when out cold, flailing when awake; the step swings it a little.
export const loadOf = (carried) => (carried ? (carried.status === 'ok' ? 'flail' : 'limp') : '');

// Note: shortest signed turn from angle a to angle b.
export const turnTo = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const FALL_T = 0.9;
// Note: a fall is a stagger on bent knees, then the body topples and settles; side is -1 or 1.
export function fallFrame(since, side) {
  const u = clamp01(since / FALL_T);
  if (u < 0.45) {
    const k = u / 0.45;
    return { standing: true, rot: side * 0.5 * (1 - (1 - k) * (1 - k)), scale: 0.92 - 0.06 * k };
  }
  const k = (u - 0.45) / 0.55;
  return { standing: false, rot: side * 0.5 * (1 - k) * (1 - k), scale: 1 + 0.1 * (1 - k) };
}

// Note: a hit is shown by a reaction, never by colour. The sim writes actor.react = { kind, t0, dur, dir, side, region, severity } (sim seconds, dir in radians, side -1 left and +1 right of the facing) or null; until it does, a hit event makes one.
export const REACT_T = { flinch: hitReaction('arm', 1).dur, buckle: hitReaction('leg', 1).dur, stagger: hitReaction('chest', 1).dur, snap: hitReaction('head', 1).dur };
// Note: a quick onset, a sustained protective pose, then a slow recovery.
export const REACT_JERK = 0.08;
// Note: the sprite shows the reaction pose while the jerk is at least this strong, so each reaction has a handful of pictures, not one per frame.
export const REACT_POSE_K = 0.3;
const REACT_OF_REGION = { arm: 'flinch', leg: 'buckle', chest: 'stagger', abdomen: 'stagger', head: 'snap' };

export function reactEnvelope(u) {
  if (!(u >= 0 && u < 1)) return 0;
  return u < REACT_JERK ? ease(u / REACT_JERK) : u < 0.4 ? 1 : 1 - ease((u - 0.4) / 0.6);
}

// Note: the reaction a wound event stands for, as the contract object; null for a region with none.
export function reactOfHit(e, now, dir = 0) {
  const kind = REACT_OF_REGION[e.region];
  const severity = Number.isFinite(e.severity) ? e.severity : 1;
  return kind ? { kind, t0: now, dur: hitReaction(e.region, severity, e).dur, dir: Number.isFinite(e.dir) ? e.dir : dir, side: e.side || 0, region: e.region, severity } : null;
}

// Note: a wound-driven fall favours the injured side; its direction is visual, never a bullet impulse.
export function fallSide(a) {
  const r = a.react;
  if (r && Number.isFinite(r.dir)) return r.side < 0 ? -1 : r.side > 0 ? 1 : Math.sin(r.dir - (a.facing || 0)) >= 0 ? 1 : -1;
  return hash01(a.id, 3) < 0.5 ? -1 : 1;
}

// Note: offsets are game pixels in world axes (1/16 tile each), rot is radians, hit names the pose overlay of the sprite ('' when the jerk is weak). Defensive: any odd object gives null or a clamped result.
export function reactFrame(r, now, facing = 0) {
  if (!r || !REACT_T[r.kind] || !(r.dur > 0)) return null;
  const k = reactEnvelope((now - r.t0) / r.dur);
  if (k <= 0) return null;
  const sev = clamp(Number.isFinite(r.severity) ? r.severity : 1, 0.25, 1.6);
  const dir = Number.isFinite(r.dir) ? r.dir : facing + Math.PI;
  const side = r.side < 0 ? -1 : r.side > 0 ? 1 : 0;
  // Note: with no side the body rocks away from where the shot came in.
  const rock = side || (Math.sin(dir - facing) >= 0 ? 1 : -1);
  const a = k * sev;
  let push = 0;
  let lurch = 0;
  let rot = 0;
  let scale = 1;
  let hit = '';
  if (r.kind === 'flinch') {
    push = 0.2 * a;
    rot = 0.1 * a * rock;
    hit = side < 0 ? 'armL' : 'armR';
  } else if (r.kind === 'buckle') {
    lurch = 2.4 * a * (side || rock);
    rot = 0.06 * a * (side || rock);
    scale = 1 - 0.06 * a;
    hit = side < 0 ? 'legL' : 'legR';
  } else if (r.kind === 'stagger') {
    push = 0.45 * a;
    rot = 0.16 * a * rock;
    hit = r.region === 'abdomen' ? 'belly' : 'chest';
  } else {
    push = 0.25 * a;
    rot = 0.1 * a * rock;
    hit = 'snap';
  }
  return {
    kind: r.kind,
    k,
    ox: Math.cos(dir) * push - Math.sin(facing) * lurch,
    oy: Math.sin(dir) * push + Math.cos(facing) * lurch,
    rot,
    scale,
    hit: k >= REACT_POSE_K ? hit : '',
  };
}

export const STARTLE_T = 0.22;
export const startleScale = (since) => (since >= 0 && since < STARTLE_T ? 1 + 0.14 * (1 - since / STARTLE_T) : 1);

// Note: the watchful hold at a post; the head keeps to the arc while the body sweeps, plus a slow scan, in steps of 0.8 texel from -WATCH_MAX to WATCH_MAX (right is positive).
export const WATCH_T = 4.2;
export const WATCH_MAX = 5;
export const WATCH_HERE = 1;

// Note: pure; null unless the actor is a standing-by deputy at the post. holdSpot.arc is the direction to watch; without it the facing stands in.
export function watchOf(a, now) {
  if (!a || a.status !== 'ok' || a.carrying || a.carried || !a.ai || a.ai.state !== 'holding') return null;
  const h = a.ai.holdSpot;
  const spot = h && Number.isFinite(h.x) && Number.isFinite(h.y);
  if (spot && ((h.f !== undefined && h.f !== a.floor) || Math.hypot(a.x - h.x, a.y - h.y) > WATCH_HERE)) return null;
  const face = Number.isFinite(a.facing) ? a.facing : 0;
  const arc = h && Number.isFinite(h.arc) ? h.arc : face;
  // Note: the head leans toward the arc by up to about 20 degrees; the scan adds a few more either way.
  const bias = clamp(turnTo(face, arc), -0.35, 0.35) / 0.35;
  const scan = Math.sin((Number.isFinite(now) ? now : 0) * ((Math.PI * 2) / WATCH_T) + (a.id | 0) * 1.7);
  const sweep = Math.round(clamp(bias * 3 + scan * 3, -WATCH_MAX, WATCH_MAX));
  return { arc, sweep };
}

// Note: the door leaf in door-local pixels (a along the wall from the hinge end, b across it); p 0 is closed, 1 is open edge-on.
export function leafRect(p, shake = 0) {
  const e = ease(p);
  const w = 16 + (2 - 16) * e;
  const b0 = 2 * e;
  const b1 = 16 - 2 * e;
  return { a0: 0, a1: w, b0: b0 + shake, b1: b1 + shake };
}

// Note: a sliding sash; open is 1 and the glass shrinks to the top strip.
export const sashRect = (p, shake = 0) => ({ top: 4 + shake, glassH: 8 - 5 * ease(p) });

// Note: how long each gesture lasts, in seconds; a beat is how long one half of a two-beat gesture holds.
export const GESTURE_T = 0.9;
export const SHOUT_T = 0.7;
export const MODE_T = 0.7;
export const NOD_T = 0.8;
export const SHAKE_T = 0.15;
export const BEAT_T = 0.2;
// Note: the 'signal' pose phases; 0 is the pointing arm (hostile spotted), 3 and 4 the refusal palm, 5 and 6 the quiet hand, 7 and 8 the hand cupped at the mouth, 9 and 10 the flat palm pressed down twice (hold), 11 and 12 the raised fist (cover me), 13 and 14 the flat hand swept out and back (fall back).
export const HOLD_BEAT = 0.225;
export const COVER_BEAT = 0.25;
export const FALLBACK_BEAT = 0.3;
export const GESTURE_PH = { hostile: 0, push: 0, refuse: 3, quiet: 5, cup: 7, hold: 9, cover: 11, fallback: 13 };

// Note: what an event draws, as { act, ph, beat, nod, dur } or null; role is the actor's. The sheriff switching to hands only raises a quiet hand, back to voice cups a hand at the mouth; the deputy answers an order by nodding, or with a shaken head and a flat palm.
export function gestureFor(e, role) {
  if (e.type === 'signalMode') return role === 'sheriff' ? { act: 'signal', ph: e.signal ? GESTURE_PH.quiet : GESTURE_PH.cup, beat: BEAT_T, dur: MODE_T } : null;
  if (e.type === 'command') return e.method === 'voice' && role === 'sheriff' ? { act: 'shout', ph: 0, dur: SHOUT_T } : null;
  if (e.type !== 'signal') return null;
  if (e.ack === 'yes') return { nod: 'yes', dur: NOD_T };
  if (e.ack === 'no') return { act: 'signal', ph: GESTURE_PH.refuse, beat: SHAKE_T, nod: 'no', dur: GESTURE_T };
  const beat = { hold: HOLD_BEAT, cover: COVER_BEAT, fallback: FALLBACK_BEAT }[e.kind];
  return { act: 'signal', ph: GESTURE_PH[e.kind] ?? GESTURE_PH.hostile, ...(beat ? { beat } : {}), dur: GESTURE_T };
}

// Note: the pose phase of a running gesture; a two-beat gesture alternates its phase and the first one stays on.
export const gesturePhase = (g, since) => (g.beat ? g.ph + (Math.floor(since / g.beat) % 2) : g.ph);

// Note: head overlay 0 none, 1 dipped, 2 and 3 turned each way; a nod dips twice, a shake turns four times.
export function nodAt(kind, since) {
  if (kind === 'yes') return since >= 0 && since < NOD_T && Math.floor(since / BEAT_T) % 2 === 0 ? 1 : 0;
  if (kind === 'no') return since >= 0 ? 2 + (Math.floor(since / SHAKE_T) % 2) : 0;
  return 0;
}

export class Animator {
  constructor() {
    this.s = new Map();
    this.t = -1;
    this.lower = null;
  }

  state(a, now) {
    let s = this.s.get(a.id);
    if (!s) {
      s = { x: a.x, y: a.y, floor: a.floor, dist: 0, moving: false, lastMode: 'walk', status: a.status, ai: a.ai ? a.ai.state : null, fall: null, react: null, startle: -9, shotAt: -9, clickAt: -9, gesture: null, nod: null, heading: 0, seen: now };
      this.s.set(a.id, s);
    }
    return s;
  }

  // Note: events from sim.drain(); they only mark times, the poses come from frame().
  consume(events, sim) {
    const t = sim.time;
    for (const e of events) {
      const a = e.actorId != null ? sim.byId(e.actorId) : null;
      if (e.type === 'shot' && a) this.state(a, t).shotAt = t;
      else if (e.type === 'click' && a) this.state(a, t).clickAt = t;
      else if (e.type === 'hit' && a && a.react === undefined) {
        // Note: the sim has no react field yet, so the reaction is made here from the wound event; the bullet came from its owner.
        const o = e.ownerId != null ? sim.byId(e.ownerId) : null;
        this.state(a, t).react = reactOfHit(e, t, o ? Math.atan2(a.y - o.y, a.x - o.x) : (a.facing || 0) + Math.PI);
      }
      else if (e.type === 'carry' && e.stage === 'lower' && a) {
        // Note: the event may name the carrier or the body; the carrier is the deputy and the body the sheriff.
        const by = a.role === 'sheriff' ? (sim.deputy ? sim.deputy.id : null) : a.id;
        const body = a.role === 'sheriff' ? a.id : (e.bodyId ?? e.targetId ?? (sim.sheriff ? sim.sheriff.id : null));
        this.lower = { by, body, t0: t, until: t + LOWER_T };
      } else if (e.type === 'signal' || e.type === 'signalMode' || e.type === 'command') {
        const who = e.type === 'command' ? sim.sheriff : a;
        const g = who ? gestureFor(e, who.role) : null;
        if (g) this.give(who, g, t);
      }
    }
  }

  // Note: the pickup action run backwards while the carrier puts the body down, or null.
  lowering(t) {
    const l = this.lower;
    if (!l || t >= l.until) return null;
    return { by: l.by, body: l.body, action: { type: 'pickup', t: (1 - (t - l.t0) / LOWER_T) * LIFT_RUN, dur: LIFT_RUN, id: l.body } };
  }

  // Note: who is lifting this body (or lowering it) and how far along that is.
  liftOf(sim, a, t) {
    const real = sim.actors.find((d) => d.action && d.action.type === 'pickup' && d.action.id === a.id);
    if (real) return { host: real, action: real.action };
    const low = this.lowering(t);
    const host = low && low.body === a.id ? sim.byId(low.by) : null;
    return host ? { host, action: low.action } : null;
  }

  // Note: starts a gesture on an actor; the arm pose and the head overlay run on their own clocks.
  give(a, g, t) {
    const s = this.state(a, t);
    if (g.act) s.gesture = { act: g.act, ph: g.ph, beat: g.beat || 0, t0: t, until: t + g.dur };
    if (g.nod) s.nod = { kind: g.nod, t0: t, until: t + g.dur };
  }

  // Note: once per frame for every actor, so a fall or a startle in the dark is already over when the actor comes into view.
  track(sim) {
    const t = sim.time;
    const dt = t - this.t;
    for (const a of sim.actors) {
      const s = this.state(a, t);
      if (dt > 0) {
        const d = Math.hypot(a.x - s.x, a.y - s.y);
        const jump = d > 1.5 || (a.floor !== s.floor && !a.elev);
        if (!jump) {
          s.dist += d;
          s.moving = d / dt > 0.35;
          if (Math.abs(a.y - s.y) > 1e-4) s.heading = Math.sign(a.y - s.y);
        } else s.moving = false;
        s.x = a.x;
        s.y = a.y;
        s.floor = a.floor;
      }
      if (s.status === 'ok' && a.status !== 'ok') s.fall = { t0: t, side: fallSide(a) };
      s.status = a.status;
      if (a.mode && a.mode !== 'idle') s.lastMode = a.mode;
      const ai = a.ai ? a.ai.state : null;
      if (a.role === 'hostile' && ai !== s.ai && (ai === 'engage' || ai === 'search') && (s.ai === 'idle' || s.ai === 'suspicious')) s.startle = t;
      s.ai = ai;
      // Note: the sim's own startle (any role) pulses once when it is set.
      const su = a.ai ? a.ai.startleUntil : null;
      if (su != null && su !== s.startleUntil) {
        if (su > t) s.startle = t;
        s.startleUntil = su;
      }
    }
    this.t = t;
  }

  // Note: what to draw for one actor now; pose fields go into the sprite key, the rest moves or tints the image.
  frame(a, sim, viewFloor = a.floor) {
    const f = this.pose(a, sim);
    const rel = heightOf(a, viewFloor);
    if (rel) {
      f.scale *= heightScale(rel);
      f.oy += heightLift(rel);
    }
    return f;
  }

  // Note: the carried body in the carrier's frame; a struggle swings on the clock, a limp body on the step.
  loadFrame(f, body, step, t) {
    f.load = loadOf(body);
    f.lph = f.load === 'flail' ? Math.floor(t * 5) % 2 : step % 2;
    f.loadBloody = !!(body.wounds && body.wounds.some((w) => !w.old));
  }

  pose(a, sim) {
    const t = sim.time;
    const s = this.state(a, t);
    const f = { act: 'none', ph: 0, ox: 0, oy: 0, rot: 0, scale: 1, alpha: 1, x: null, y: null, weapon: null, stow: '', state: null, stance: null, behind: false, gait: '', sweep: 0, lift: 0, hidden: false, load: '', lph: 0, loadBloody: false, nod: 0, hit: '' };
    // Note: a carried body lies across the carrier's shoulders, limp when out cold and flailing when awake.
    if (a.carried) {
      const c = sim.byId(a.carriedBy);
      f.act = 'carried';
      f.ph = a.status === 'ok' ? 2 + (Math.floor(t * 5) % 2) : c ? stepPhase(this.state(c, t).dist) % 2 : 0;
      f.rot = (c ? c.facing || 0 : a.facing || 0) - (a.facing || 0) + Math.PI / 2 + Math.sin(t * 5) * 0.06;
      f.state = a.status === 'ok' ? 'down' : null;
      f.hidden = true;
      return f;
    }
    if (a.status !== 'ok') {
      const lf = this.liftOf(sim, a, t);
      if (lf) {
        const lifter = lf.host;
        // Note: the body is hauled onto the kneeling deputy's shoulders; it lies flat first, then turns across them.
        const l = liftFrame(lf.action);
        f.act = l.up ? 'carried' : 'none';
        f.ph = 0;
        f.state = l.up ? 'down' : null;
        f.x = a.x + (lifter.x - a.x) * l.slide;
        f.y = a.y + (lifter.y - a.y) * l.slide;
        f.rot = turnTo(a.facing || 0, (lifter.facing || 0) + Math.PI / 2) * l.turn;
        f.scale = l.scale;
        f.lift = l.p;
        f.hidden = l.up;
        return f;
      }
      if (s.fall && t - s.fall.t0 < FALL_T) {
        const ff = fallFrame(t - s.fall.t0, s.fall.side);
        f.rot = ff.rot;
        f.scale = ff.scale;
        if (ff.standing) {
          f.state = 'ok';
          f.stance = 'crouch';
        }
      }
      return f;
    }
    const w = a.weapons && a.weapons[a.cur];
    const kind = kindOf(w);
    const low = this.lowering(t);
    const act = a.action || (low && low.by === a.id ? low.action : null);
    const cycle = w ? WEAPONS[w.id].cycle : 0.5;
    const cyc = cycleFrame(kind, t - s.shotAt, cycle) || (kind !== 'none' && t - s.clickAt < 0.25 ? { act: 'click', ph: 0 } : null);
    const face = a.facing || 0;
    // Note: a hostile that has noticed the lawmen and stands still holds the weapon up (the ready stance); the deputy reads exactly this as "braced".
    const braced = a.role === 'hostile' && a.ai && a.ai.state === 'engage' && (a.broken ?? 0) <= t;
    const gait = gaitOf({ mode: s.moving ? (a.mode !== 'idle' ? a.mode : s.lastMode) : 'idle', stance: a.stance, pace: a === sim.sheriff ? sim.pace : braced ? 'sprint' : undefined });
    if (a.blasting) Object.assign(f, blastFrame(a.blasting, kind, face));
    else if (act && act.type === 'reload') Object.assign(f, reloadFrame(act, kind));
    else if (act && act.type === 'switch') {
      const to = a.weapons[act.to];
      Object.assign(f, switchFrame(act, kind, kindOf(to)));
    } else if (act && (act.type === 'door' || act.type === 'window')) {
      if (act.op === 'force') {
        const b = breachFrame(act.thud ?? 0.9);
        f.act = act.type === 'door' ? 'kick' : 'smash';
        f.ph = b.ph;
        if (b.ph === 2) {
          f.ox += Math.cos(face) * 1.5;
          f.oy += Math.sin(face) * 1.5;
        }
      } else if (act.op === 'climb') {
        const v = vaultFrame(act);
        f.act = 'vault';
        f.ph = v.ph;
        f.scale = v.scale;
        f.weapon = 'none';
        if (act.dest) {
          f.x = a.x + (act.dest.x - a.x) * v.slide;
          f.y = a.y + (act.dest.y - a.y) * v.slide;
        }
      } else {
        f.act = 'reach';
        f.ph = act.t / act.dur < 0.5 ? 0 : 1;
      }
    } else if (act && act.type === 'knife') {
      f.act = 'knife';
      f.ph = act.t / act.dur < 0.5 ? 0 : 1;
      f.weapon = 'none';
      f.stow = kind;
    } else if (act && act.type === 'scavenge') {
      f.act = 'search';
      f.ph = Math.floor(t * 3) % 2;
      f.weapon = 'none';
      f.stow = kind;
    } else if (act && act.type === 'custody') {
      // Note: tying a surrendered man's hands reads as a stooped search with the gun put away.
      f.act = 'search';
      f.ph = Math.floor(t * 3) % 2;
      f.weapon = 'none';
      f.stow = kind;
    } else if (act && act.type === 'pickup') {
      f.act = 'lift';
      f.ph = act.t / act.dur < 0.5 ? 0 : 1;
      f.weapon = 'none';
      f.stow = kind;
      // Note: from the lift on, the body is part of this picture; before that it lies on the floor and slides in.
      const body = sim.byId(act.id);
      if (liftFrame(act).up && body) this.loadFrame(f, body, 0, t);
    } else if (a.carrying) {
      f.act = 'carry';
      f.ph = s.moving ? stepPhase(s.dist) : 0;
      f.weapon = 'none';
      f.stow = kind;
      const body = sim.byId(a.carrying);
      if (body) this.loadFrame(f, body, f.ph, t);
    } else if (cyc) {
      f.act = cyc.act;
      f.ph = cyc.ph;
      if (cyc.act === 'recoil') {
        const k = kickBack(t - s.shotAt, cycle);
        f.ox -= Math.cos(face) * k;
        f.oy -= Math.sin(face) * k;
      }
    } else if (s.gesture && t < s.gesture.until) {
      f.act = s.gesture.act;
      f.ph = gesturePhase(s.gesture, t - s.gesture.t0);
    } else if (a.role === 'civilian' && a.ai?.mode === 'freeze' && !s.moving) {
      f.act = 'handsUp';
    } else if (a.role === 'hostile' && a.surrendered && a.secured && !a.associate) {
      // Note: item 492: a secured man kneels with his hands tied.
      f.act = 'cower';
      f.ph = 0;
    } else if (a.role === 'hostile' && a.surrendered && !s.moving) {
      // Note: items 291 and 492: a man who gave up stands with both hands raised.
      f.act = 'handsUp';
    } else if (a.role === 'civilian' && a.ai && a.ai.state === 'panic' && a.ai.mode === 'hide' && !s.moving) {
      f.act = 'cower';
      f.ph = Math.floor(t * 9) % 2;
    } else if (a.dozing) f.act = 'doze';
    else if (s.moving) {
      f.act = 'walk';
      f.ph = stepPhaseAt(s.dist, strideOf(gait) * (a.elev ? FLIGHT_STRIDE : 1));
    }
    // Note: on the flight the body bobs with the climb and the head leans the way it goes.
    if (a.elev && s.moving) {
      const fl = flightFrame(a, s.heading);
      f.oy += fl.bob * fl.dir;
    }
    if (f.act === 'walk' || f.act === 'none') f.gait = spriteGait(gait);
    // Note: holding the post, standing still and not otherwise busy: the watch pose with the head sweeping.
    if (f.act === 'none' && !s.moving) {
      const w = watchOf(a, t);
      if (w) {
        f.gait = 'watch';
        f.sweep = w.sweep;
      }
    }
    if (s.nod && t < s.nod.until) f.nod = nodAt(s.nod.kind, t - s.nod.t0);
    const rx = reactFrame(a.react !== undefined ? a.react : s.react, t, face);
    if (rx) {
      f.ox += rx.ox;
      f.oy += rx.oy;
      f.rot += rx.rot;
      f.scale *= rx.scale;
      f.hit = rx.hit;
    }
    f.scale *= startleScale(t - s.startle);
    return f;
  }
}
