// Note: what an actor remembers of the people it saw and heard, and how it watches believed hostile positions.

import { castRay } from './los.js';
import { dist } from './rand.js';
import { observeThreat, dropThreat } from './mind.js';
import { isLawman, isEnemy, isFriend } from './actors.js';
import { inPushReach } from './tactical-zones.js';

// Note: a pushing deputy who has just fought stands and watches this long before he advances again.
const CONTACT_HOLD = 1;
// Note: the walking pace, in m/s, at which a known hostile may have made an earlier sound elsewhere.
const EXPLAIN_SPEED = 1.5;
const EXPLAIN_SLACK = 2;

// Note: a lawman seen again within this many seconds was kept in view.
const SEEN_GAP = 0.5;
// Note: an unobstructed look this long checks a watched position.
export const CHECK_TIME = 0.6;
// Note: seconds a search stays on one believed position before it tries another.
const HUNT_TIME = 20;

export const snapshot = (a, t) => ({ id: a.id, x: a.x, y: a.y, f: a.floor, floor: a.floor,
  lastFiredAt: a.lastFiredAt, lastHitAt: a.lastHitAt, facing: a.facing, status: a.status, role: a.role, passive: a.passive, mode: a.mode, carried: !!a.carried,
  moveDesired: a.moveDesired && { ...a.moveDesired }, stance: a.stance, elev: a.elev, deathAt: a.deathAt, wounds: a.wounds.map((w) => ({ ...w })),
  weapons: a.weapons.map((w) => ({ ...w })), cur: a.cur, hand: a.hand, mods: a.mods && { ...a.mods },
  eye: { ...a.eye }, t });

export function remember(sim, a) {
  const ai = a.ai;
  const mind = ai.mind;
  for (const other of sim.actors) {
    if (other === a || other.withdrawn) continue;
    const touching = other.floor === a.floor && dist(a, other) < 1.1 && castRay(sim.map, a.floor, a.x, a.y, other.x, other.y).clear;
    if (!sim.sees(a, other) && !touching) continue;
    const before = ai.people.get(other.id);
    // Note: a hit on a lawman kept in view is seen.
    if (other.role !== 'hostile' && before && sim.time - before.t <= SEEN_GAP && (other.lastHitAt ?? -Infinity) > before.t) ai.friendHitAt = sim.time;
    ai.people.set(other.id, snapshot(other, sim.time));
    if (isEnemy(a, other)) {
      if (other.status === 'ok' && !other.surrendered) observeThreat(mind, { ...snapshot(other, sim.time), src: 'saw', conf: 1 });
      else dropThreat(mind, other.id);
    }
  }
  for (const h of a.heard) {
    if (h.remembered) continue;
    h.remembered = true;
    if (h.srcId === sim.sheriff.id) {
      // Note: a sound places the sheriff but does not raise one already seen down or dead.
      const known = ai.people.get(sim.sheriff.id)?.status;
      ai.sheriffReport = { ...h.pos, f: h.floor, floor: h.floor, status: known && known !== 'ok' ? known : 'ok', t: h.t };
    }
    const enemy = isEnemy(a, { role: h.srcRole });
    const friend = isFriend(a, { role: h.srcRole });
    if (a.role === 'hostile' && friend && h.contact) observeThreat(mind, { ...h.contact, t: h.t, src: 'report', conf: 0.8 });
    if (friend && h.sheriffDown && a.role === 'deputy') ai.toldSheriffDown = true;
    if (friend && h.clears) mind.threats = mind.threats.filter((p) => h.clears.every((c) => p.f !== c.f || dist(p, c) > 0.8));
    if (enemy) observeThreat(mind, { x: h.pos.x, y: h.pos.y, f: h.floor, t: h.t, src: 'heard', conf: 0.5, ...(h.kind?.startsWith('gunshot') ? { shotAt: h.t } : {}) });
  }
  const dt = Math.min(0.25, sim.time - (ai.checkedAt ?? sim.time));
  ai.checkedAt = sim.time;
  mind.threats = mind.threats.filter((p) => {
    const visible = p.f === a.floor && sim.pointVisible(a, p.x, p.y);
    const present = visible && sim.actors.some((o) => o !== a && o.status === 'ok' && !o.surrendered &&
      isEnemy(a, o) &&
      o.floor === p.f && dist(o, p) < 0.8 && sim.sees(a, o));
    p.checked = visible && !present ? (p.checked || 0) + dt : 0;
    if (p.checked < CHECK_TIME) return true;
    if (a.role === 'deputy') sim.reportClear(a, p);
    // Note: the engaged target's last spot found empty is where a Push widens its search from.
    if (p.id != null && p.id === (ai.engaged ?? ai.lastEngaged)) ai.searchFrom = { x: p.x, y: p.y, f: p.f };
    return false;
  });
  if (a.role === 'deputy') sim.flushClear(a);
}

// Note: the lawmen this actor last saw on their feet, as remembered snapshots.
export const knownLawmen = (a) => [...a.ai.people.values()].filter((p) => isLawman(p) && p.status === 'ok');

export function sheriffEstimate(sim, a) {
  const seen = a.ai.people.get(sim.sheriff.id);
  const report = a.ai.sheriffReport;
  const p = report && (!seen || report.t > seen.t) ? { ...seen, ...report, eye: { x: report.x, y: report.y } } : seen;
  const out = p || { ...sim.house.spawn.sheriff, f: 0, floor: 0, status: 'unknown', t: -Infinity };
  return { facing: a.facing, mode: 'idle', stance: 'stand', ...out, eye: out.eye || { x: out.x, y: out.y }, wounds: out.wounds || [], weapons: out.weapons || [] };
}

// Note: the threat a pushing deputy last engaged, which a push follows rather than its post while it lasts.
export function pushContact(a) {
  const id = a.ai.engaged ?? a.ai.target ?? a.ai.lastEngaged;
  return id == null ? null : a.ai.mind.threats.find((p) => p.id === id) || null;
}

// Note: a head count of hostiles known by sight plus sounds none of them could have made.
export function estimatedEnemies(a) {
  const threats = a.ai.mind.threats;
  const heads = threats.filter((p) => p.id != null);
  const explains = (q, p) => q.f === p.f && dist(q, p) <= EXPLAIN_SLACK + EXPLAIN_SPEED * Math.abs(q.t - p.t);
  for (const p of threats) if (p.id == null && !heads.some((q) => explains(q, p))) heads.push(p);
  return heads.length;
}

const nearestThreat = (a, threats, skip) => threats.filter((p) => p.f === a.floor && p !== skip).sort((p, q) => dist(a, p) - dist(a, q))[0] || null;

// Note: the hunted position is kept until checked clear or for HUNT_TIME, so a new sound does not turn the search round.
function huntTarget(sim, a, threats) {
  const ai = a.ai;
  const h = ai.hunt;
  if (h && threats.includes(h.p) && sim.time - h.since < HUNT_TIME) return h.p;
  if (h && threats.includes(h.p)) ai.huntSkip = { p: h.p, until: sim.time + HUNT_TIME };
  const skip = ai.huntSkip && sim.time < ai.huntSkip.until ? ai.huntSkip.p : null;
  const p = nearestThreat(a, threats, skip) || nearestThreat(a, threats);
  ai.hunt = p ? { p, since: sim.time } : null;
  return p;
}

// Note: watching believed hostile positions in every approach mode, with pursuing hostiles on the push path.
export function watchedIntent(sim, a, mode, base = {}) {
  const threats = a.ai.mind.threats;
  const last = mode === 'push' ? pushContact(a) : null;
  if (last && sim.time - (a.ai.foughtAt ?? -Infinity) < CONTACT_HOLD) return { ...base, goal: null, face: Math.atan2(last.y - a.y, last.x - a.x), steady: true };
  // Note: a push keeps to its engaged target even while it flickers in and out of sight.
  if (!threats.length || (threats.some((p) => p.src === 'saw' && p.t === sim.time) && !last)) return base;
  // Note: a push sweeping its zone keeps its own look until it has a target to pursue.
  if (mode === 'push' && !last && a.ai.order?.sweep) return base;
  // Note: without an engaged target only an unordered push hunts the nearest position.
  const near = mode === 'push' && !last && !a.ai.order?.accepted ? huntTarget(sim, a, threats) : null;
  const target = last || near;
  const p = target || threats[Math.floor(sim.time / 1.2) % threats.length];
  const out = { ...base, face: Math.atan2(p.y - a.y, p.x - a.x), steady: true };
  const abandoned = a.ai.abandonedGoal;
  // Note: a teammate's pursuit keeps within the push bound round the sheriff until he is known down (item 478).
  const bounded = a.role === 'deputy' && !a.ai.autonomous && !inPushReach(sim, sheriffEstimate(sim, a), p);
  if (target && !bounded && (!base.goal || last) && p.f === a.floor && !(abandoned && sim.time < abandoned.until && abandoned.f === p.f && dist(abandoned, p) < 1)) {
    const r = dist(a, p);
    if (r > 1.2) out.goal = { ...p, r: 1, windows: true };
    else {
      const angle = (Math.floor(sim.time / 2) % 8) * Math.PI / 4;
      out.goal = { x: p.x + Math.cos(angle) * 2, y: p.y + Math.sin(angle) * 2, f: p.f, r: 0.5, windows: true };
    }
  }
  return out;
}
