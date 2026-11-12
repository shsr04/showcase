// Note: a teammate's tactical layer: how exposed ground and routes are, and where to fight from, read from its own picture of the threats (item 424).

import { castRay, eyePosition, lineClear3, absZ } from './los.js';
import { EYE_Z, MUZZLE_Z, CHEST_Z } from './config.js';
import { tileAt, solidAt, opaqueAt } from './map.js';
import { T, isFlight } from './tiles.js';
import { findPath } from './nav.js';
import { clamp, dist, unit } from './rand.js';

// Note: a known foe seen within SEEN_HOT seconds, or a shot heard within SHOT_HOT, still holds a live line of fire.
export const SEEN_HOT = 4;
const SHOT_HOT = 10;
// Note: body sample heights for a crouched and a standing man; the last one is the head and goes with a lean.
const BODY = { crouch: [0.35, 0.75, 1.05], stand: [0.45, 0.95, 1.3, 1.6] };
// Note: a lean that moves the eye less than this is no lean, since the head stays behind the same corner.
const LEAN_MIN = 0.25;
// Note: a spot closer than this to another lawman is taken, and one within SPACE metres crowds him.
const BODY_GAP = 1.2;
const SPACE = 2;
// Note: a firing position must beat the present one by this much to be worth the move.
export const MOVE_GAIN = 0.3;

// Note: items 171 and 465–467: the tactical sense of a teammate, 0 to 1, from Awareness, Toughness and Precision; the baseline skill gives 0.5, and fatigue and drink dull it.
export function tacticalSense(a) {
  const sk = a.skill;
  const base = sk ? 0.5 * sk.awareness + 0.35 * sk.nerve + 0.15 * sk.handling : { green: 0.2, seasoned: 0.5, veteran: 0.8 }[a.traits?.experience] ?? 0.5;
  const dull = clamp(1.3 - 0.3 * (a.mods?.think ?? 1), 0.6, 1);
  return clamp(base * dull, 0, 1);
}

// Note: believed hostile positions with a weight for how sure and how dangerous each is: a foe seen braced or firing is aware, an unaware one seen is a lesser risk, a heard shot marks a shooter.
export function threatPicture(sim, a) {
  const now = sim.time;
  const foes = a.ai.foes;
  const out = [];
  for (const p of a.ai.mind.threats) {
    const age = now - p.t;
    const shot = now - (p.shotAt ?? -Infinity) < SHOT_HOT;
    const aware = (p.id != null && !!foes?.has(p.id)) || shot;
    const live = aware && (p.src === 'saw' ? age < SEEN_HOT : shot);
    let w = p.src === 'saw' ? (aware ? (age < SEEN_HOT ? 1 : 0.6) : 0.3) : p.src === 'report' ? 0.45 : shot ? 0.7 : 0.25;
    w *= clamp(p.conf ?? 0.5, 0.4, 1);
    out.push({ x: p.x, y: p.y, f: p.f, id: p.id, w, aware, live, t: p.t, shotAt: p.shotAt });
  }
  return out.sort((p, q) => q.w - p.w);
}

// Note: a straight line between heights over two points; on one floor it is the ordinary ray, and between floors it must pass the slab inside a stairwell.
function lineOpen(sim, q, qz, p, pz) {
  if (q.f === p.f) return castRay(sim.map, p.f, q.x, q.y, p.x, p.y, [qz, pz]).clear;
  if (!sim.shaft?.rect || Math.abs(q.f - p.f) > 1) return false;
  return lineClear3(sim.map, sim.shaft, q, absZ(q.f, 0, qz), p.x, p.y, absZ(p.f, 0, pz));
}

// Note: the half width of a body as sight samples it, so cover must hide his sides as well as his middle.
const SIDE = 0.22;

// Note: the share of a body at p, crouched or standing, that a standing man at q sees; walls hide all of it and low furniture the part below its top, a lean takes the head out to the eye, and the trunk counts at both sides.
export function exposureFrom(sim, q, p, stance = 'crouch', eye = null) {
  const zs = BODY[stance];
  const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const side = { x: (-(p.y - q.y) / d) * SIDE, y: ((p.x - q.x) / d) * SIDE };
  let seen = 0;
  let of = 0;
  for (let i = 0; i < zs.length; i++) {
    const head = i === zs.length - 1;
    const points = head ? [eye ? { ...eye, f: p.f } : p] : [p, { x: p.x + side.x, y: p.y + side.y, f: p.f }, { x: p.x - side.x, y: p.y - side.y, f: p.f }];
    for (const at of points) {
      of++;
      if (lineOpen(sim, q, EYE_Z.stand, at, zs[i])) seen++;
    }
  }
  return seen / of;
}

// Note: whether the eye at a stance sees a target's chest and the muzzle below it has a free line to it.
function lineTo(sim, eye, f, t, stance) {
  const z = t.stance ? CHEST_Z[t.stance] : CHEST_Z.crouch;
  const from = { x: eye.x, y: eye.y, f };
  return lineOpen(sim, from, EYE_Z[stance], t, z) && lineOpen(sim, from, MUZZLE_Z[stance], t, z);
}

const nearWall = (sim, f, x, y) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaqueAt(sim.map, f, x + dx, y + dy)) return true;
  return false;
};

// Note: the best way to shoot at t from p with the least of the body shown: crouched, crouched round a corner, or standing over low cover; null when no way sees and reaches him.
export function shootFrom(sim, p, t) {
  const facing = Math.atan2(t.y - p.y, t.x - p.x);
  let best = null;
  const consider = (stance, lean, eye) => {
    if (!lineTo(sim, eye, p.f, t, stance)) return;
    const shown = exposureFrom(sim, t, p, stance, lean ? eye : null);
    if (!best || shown < best.shown) best = { stance, lean, shown, eye };
  };
  consider('crouch', 0, p);
  if (best?.shown === 0) return best;
  if (nearWall(sim, p.f, Math.floor(p.x), Math.floor(p.y))) {
    for (const side of [-1, 1]) {
      const eye = eyePosition(sim.map, p.f, p, facing, side);
      if (Math.hypot(eye.x - p.x, eye.y - p.y) >= LEAN_MIN) consider('crouch', side, eye);
    }
  }
  if (!best || best.shown > 0.4) consider('stand', 0, p);
  return best;
}

// Note: how much of a line of travel the live aware threats see, from 0 (hidden all the way) to the sum of their weights.
export function routeRisk(sim, points, threats) {
  const live = threats.filter((q) => q.live && q.w >= 0.5);
  if (!live.length || !points.length) return 0;
  let risk = 0;
  for (const q of live) {
    let seen = 0;
    for (const p of points) if (lineOpen(sim, q, EYE_Z.stand, p, CHEST_Z.stand)) seen++;
    risk += q.w * (seen / points.length);
  }
  return risk;
}

// Note: points every 0.7 m along a straight line, for a quick look at what a short move crosses.
function along(a, b, f) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 0.7));
  return Array.from({ length: n }, (_, i) => ({ x: a.x + (b.x - a.x) * (i + 1) / n, y: a.y + (b.y - a.y) * (i + 1) / n, f }));
}

// Note: a short distance from p to the segment ab.
function offLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const k = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1);
  return Math.hypot(p.x - a.x - dx * k, p.y - a.y - dy * k);
}

// Note: a friend on the line of a shot, or just past its target where a miss goes on, spoils it (item 77).
function friendInLine(eye, t, friends) {
  const d = Math.hypot(t.x - eye.x, t.y - eye.y) || 1;
  const ux = (t.x - eye.x) / d;
  const uy = (t.y - eye.y) / d;
  return friends.some((c) => {
    if (c.f !== t.f) return false;
    const px = c.x - eye.x;
    const py = c.y - eye.y;
    const ahead = px * ux + py * uy;
    const side = Math.abs(-px * uy + py * ux);
    if (ahead > 0.4 && ahead < d) return side < 0.5 + 0.08 * ahead;
    return ahead >= d && ahead < d + 4 && side < 0.45;
  });
}

const pathLength = (a, path) => {
  let len = 0;
  let prev = a;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
};

// Note: a cell before or behind a doorway on its axis is the fatal funnel, where a man in the room sees him framed.
function funnel(sim, f, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tileAt(sim.map, f, x + dx, y + dy);
    if (t !== T.DOOR && t !== T.WINDOW) continue;
    // Note: a doorway runs across the wall, so the funnel lies on the axis that leaves the walls at its sides.
    if (solidAt(sim.map, f, x + dx - dy, y + dy - dx) && solidAt(sim.map, f, x + dx + dy, y + dy + dx)) return true;
  }
  return false;
}

// Note: the firing position near the anchor that shows least of the body to the target and the other threats while still seeing and reaching the target, or with want 'hide' the one that shows least at all.
// Note: o = { target, threats, anchor, radius, ok(p), sense, want, bodies, lanes, salt, here }; salt makes the unskilled man's misjudgement a hash, so the combat random stream is untouched.
export function fightingSpot(sim, a, o) {
  const f = a.floor;
  const sense = o.sense ?? 0.5;
  const want = o.want || 'fight';
  const t = o.target;
  const others = (o.threats || []).filter((q) => Math.abs(q.f - f) <= 1 && q.w >= 0.3 && (!t || q.f !== t.f || Math.hypot(q.x - t.x, q.y - t.y) > 1.2));
  // Note: an unskilled man thinks of the man he fights and little else.
  const otherWeight = 0.35 + 0.85 * sense;
  const anchor = o.anchor || a;
  const r = o.radius ?? 4;
  const ax = Math.floor(anchor.x);
  const ay = Math.floor(anchor.y);
  const score = (p, travel) => {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    let s = 0;
    let shot = null;
    if (t && Math.abs(t.f - f) <= 1) {
      if (want === 'fight') {
        shot = shootFrom(sim, p, t);
        if (shot && friendInLine(shot.eye, t, o.bodies || [])) shot = null;
        s += shot ? 1.6 * (1 - shot.shown) : -1.2;
      } else s += 1.6 * (1 - exposureFrom(sim, t, p, 'crouch'));
    }
    let shown = 0;
    for (const q of others) shown += q.w * exposureFrom(sim, q, p, shot?.stance ?? 'crouch', null);
    s -= otherWeight * shown;
    // Note: close in, cover is not sought by closing on the man he fights; every metre nearer inside 6 m costs, and inside 3 m more so.
    if (t && t.f === f) {
      const to = Math.hypot(p.x - t.x, p.y - t.y);
      const nearer = Math.hypot(a.x - t.x, a.y - t.y) - to;
      if (nearer > 0.3 && to < 6) s -= 0.5 * nearer + (to < 3 ? 1 : 0);
    }
    if (travel > 0.3) {
      // Note: with a gun on him every metre of the move is a metre he is not shooting back.
      s -= (0.12 + 0.35 * (o.pressure ?? 0)) * travel;
      // Note: the way there counts as far as it is more exposed than where he stands, since a man crossing a lit lane is shot crossing it, and one already in the open is shot either way.
      s -= (0.4 + 0.8 * sense) * Math.max(0, routeRisk(sim, along(a, p, f), routeThreats) - stay);
    }
    for (const b of o.bodies || []) if (b.f === f && Math.hypot(b.x - p.x, b.y - p.y) < SPACE) s -= 0.35;
    for (const [from, to] of o.lanes || []) if (from.f === f && offLine(p, from, to) < 0.7) s -= 1;
    if (funnel(sim, f, tx, ty) && !shot?.lean) s -= 0.4;
    return { x: p.x, y: p.y, f, score: s, stance: shot?.stance ?? 'crouch', lean: shot?.lean ?? 0, shown: shot ? shot.shown : null, shot: !!shot };
  };
  const routeThreats = o.routeThreats || o.threats || [];
  const stay = routeRisk(sim, [{ x: a.x, y: a.y, f }], routeThreats);
  const here = score({ x: a.x, y: a.y, f }, 0);
  // Note: with a gun on him a shot ready to go is worth taking where he stands rather than moving first.
  here.score += 0.5 * (o.ready ?? 0) * (o.pressure ?? 0);
  if (o.here === false) here.score = -Infinity;
  const cand = [];
  const span = Math.ceil(r);
  for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
    const x = ax + dx;
    const y = ay + dy;
    const p = { x: x + 0.5, y: y + 0.5, f };
    if (Math.hypot(p.x - anchor.x, p.y - anchor.y) > r) continue;
    const tile = tileAt(sim.map, f, x, y);
    if (solidAt(sim.map, f, x, y) || isFlight(tile) || tile === T.DOOR || (o.ok && !o.ok(p))) continue;
    if (Math.floor(a.x) === x && Math.floor(a.y) === y) continue;
    if ((o.bodies || []).some((b) => b.f === f && Math.hypot(b.x - p.x, b.y - p.y) < BODY_GAP)) continue;
    cand.push(p);
  }
  const jitter = (1 - sense) * 0.5;
  const rated = cand.map((p) => {
    const sc = score(p, dist(a, p));
    if (jitter && o.salt != null) sc.score += (unit(`${o.salt}:${p.x}:${p.y}`) - 0.5) * jitter;
    return sc;
  }).sort((p, q) => q.score - p.score);
  const from = { x: a.x, y: a.y, f };
  // Note: how much of the body still shows to the target when he ducks at the spot, which tells whether ducking there is worth it.
  const finish = (c, here) => ({ ...c, here, ducked: t ? exposureFrom(sim, t, c, 'crouch') : 1 });
  let tries = 0;
  for (const c of rated) {
    if (c.score <= here.score + MOVE_GAIN || ++tries > 5) break;
    const path = findPath(sim.map, from, c, { windows: false });
    if (!path || !path.every((p) => p.f === f && p.kind === 'walk')) continue;
    // Note: a detour round a wall is not a step to cover, and crossing another lawman's lane is worse than staying.
    const straight = dist(a, c);
    const len = pathLength(a, path);
    if (len > 1.6 * straight + 1.5) continue;
    const crosses = (o.lanes || []).some(([lf, lt]) => path.some((p) => offLine(p, lf, lt) < 0.6));
    const sc = c.score - 0.12 * (len - straight) - (crosses ? 1.5 : 0);
    if (sc > here.score + MOVE_GAIN) return finish({ ...c, score: sc }, false);
  }
  return finish(here, true);
}

// Note: the first doorway a path crosses within reach metres, with the way it is crossed, or null.
export function doorwayOn(sim, a, path, reach = 6) {
  let prev = { x: a.x, y: a.y };
  let walked = 0;
  for (const p of path || []) {
    walked += Math.hypot(p.x - prev.x, p.y - prev.y);
    if (walked > reach || p.f !== a.floor) return null;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const t = tileAt(sim.map, p.f, x, y);
    if (t === T.DOOR) {
      const len = Math.hypot(p.x - prev.x, p.y - prev.y) || 1;
      const horizontal = Math.abs(p.x - prev.x) >= Math.abs(p.y - prev.y);
      const dir = horizontal ? { x: Math.sign(p.x - prev.x) || 1, y: 0 } : { x: 0, y: Math.sign(p.y - prev.y) || 1 };
      return { x: x + 0.5, y: y + 0.5, f: p.f, dir, len };
    }
    prev = p;
  }
  return null;
}

// Note: stations outside a doorway on an arc about 2 m out, from the side he comes from round to the other, each looking through the opening into the room, which a wall a metre thick lets him see through only within about 45 degrees of its axis.
export function pieStations(sim, a, door, count) {
  const n = door.dir;
  const u = { x: -n.y, y: n.x };
  const side = Math.sign((a.x - door.x) * u.x + (a.y - door.y) * u.y) || 1;
  const angles = count >= 3 ? [0.6, 0.25, -0.45] : [0.55, -0.4];
  const inside = { x: door.x + n.x * 0.8, y: door.y + n.y * 0.8 };
  const out = [];
  for (const ang of angles) {
    for (const r of [2, 2.6, 1.6]) {
      const x = Math.floor(door.x - n.x * r * Math.cos(ang) + u.x * r * Math.sin(ang) * side);
      const y = Math.floor(door.y - n.y * r * Math.cos(ang) + u.y * r * Math.sin(ang) * side);
      const p = { x: x + 0.5, y: y + 0.5, f: door.f };
      const t = tileAt(sim.map, p.f, x, y);
      if (solidAt(sim.map, p.f, x, y) || isFlight(t) || t === T.DOOR || out.some((q) => q.x === p.x && q.y === p.y)) continue;
      if (!castRay(sim.map, p.f, p.x, p.y, inside.x, inside.y).clear) continue;
      out.push({ ...p, face: Math.atan2(inside.y - p.y, inside.x - p.x) });
      break;
    }
  }
  return out;
}
