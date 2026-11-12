// Note: hostile, civilian and deputy decisions, each returned as an intent the sim runs under the player's rules.

import { dist, angleDiff } from './rand.js';
import { T, DS, isFlight } from './tiles.js';
import { MAP_W, MAP_H, FOV } from './config.js';
import { tileAt, stateAt, solidAt, ringCells } from './map.js';
import { WEAPONS, clearShotToActor } from './weapons.js';
import { weaponOf } from './actors.js';
import { capability } from './wounds.js';
import { usable, itemWanted } from './arms.js';
import { castRay } from './los.js';
import { findPath, goalKey } from './nav.js';
import { BASE_LOYALTY } from './party.js';
import { seenClear, clearStamp, disprove, observeThreat, dropThreat, setAlert, alertNow } from './mind.js';
import { remember, sheriffEstimate, estimatedEnemies, watchedIntent, pushContact, knownLawmen } from './tactical-memory.js';
import { observeZones, chooseZonePost, clearZone, zoneAt, sameZone, elders, floorOf, lookOver, safe } from './tactical-zones.js';
import { tacticalSense, threatPicture, fightingSpot, routeRisk, doorwayOn, pieStations } from './tactics.js';

const I =(o = {}) => ({ move: null, ...o });
const ALARM = new Set(['gunshot_rifle', 'gunshot_handgun', 'door_force', 'window_break', 'shout', 'cry', 'glass']);
const GUNFIRE = new Set(['gunshot_rifle', 'gunshot_handgun']);
// Note: sounds that send a hostile running to the spot and hunting round it, not strolling over for a look; a comrade's call does too.
const RUSH = new Set([...GUNFIRE, 'cry']);
// Note: outdoors a hostile fights from cover: the share who take cover at contact by experience, how long one in cover peeks before he hunts, and the bound and pause of an advance on a shot.
const OUT_COVER = { green: 0.6, seasoned: 0.85, veteran: 1 };
const OUT_PEEK = 8;
const OUT_BOUND = 6;
const OUT_PAUSE = [1.2, 2.5];
// Note: outdoors, once this share of the hostiles is down, each one left may lose heart once, the likelier the weaker his nerve.
const OUT_BREAK_SHARE = 0.5;
const outdoors = (sim) => sim.house?.kind === 'outdoor';

// Note: a shot or a cry heard first-hand outranks another man's call about it, and a call outranks any other alarm.
const alarmRank = (h) => (GUNFIRE.has(h.kind) || h.kind === 'cry' ? 2 : h.contact ? 1 : 0);
// Note: after one hostile calls out a shot or a cry, the others hold their tongues this many seconds.
const ALARM_CALL_GAP = 5;
// Note: seconds a civilian keeps away from an exit he made no progress toward.
const EXIT_GIVE_UP = 60;
// Note: hostile fire is remembered this many seconds when weighing a threat.
const SHOT_MEMORY = 8;
// Note: a trained lawman needs this many quiet seconds, a look around and a safe route before lifting a downed partner.
const QUIET_NEEDED = 3;
// Note: a route this close past a believed hostile is suicidal, and a withdrawal tries at most EXIT_TRIES edge spots.
const SUICIDE_RANGE = 3;
const EXIT_TRIES = 12;
// Note: seconds after hostile fire or a hit that a deputy still counts as under fire when judging a withdrawal.
const UNDER_FIRE = 8;
const ASSESS_TIME = 2.5;
// Note: the look-around before a lift holds three facings, each long enough to notice a man in the core view.
const ASSESS_TURNS = [-1.15, 0, 1.15];
const ASSESS_HOLD = 1.2;
const CONTACT_RANGE = 8;
// Note: metres behind its target that an ally still counts as in the line of fire.
const BACKSTOP = 4;

// Note: experience sets the reaction factor k (lower is quicker) and the tactics.
const EXP = {
  green: { k: 1.3, steady: false, hold: false, crouch: false, sneak: false },
  seasoned: { k: 1, steady: true, hold: false, crouch: true, sneak: false },
  veteran: { k: 0.8, steady: true, hold: true, crouch: true, sneak: true },
};
const DEPUTY_K = 0.9;
// Note: the first shot never comes sooner than this after first sight, however quick and alert the shooter.
const FIRST_SHOT_MIN = { unaware: 1.25, wary: 1 };
const LOST_TRACK = 0.4;
// Note: a deputy's whispered answer to each order he takes.
const ACK_LINE = { cover: 'Covering.', hold: 'Holding.', push: 'Moving up.', fallback: 'Falling back.' };
const AIMED_AT = 0.3;
// Note: a pursuing hostile looks round SEARCH_LOOK seconds per spot and widens in SEARCH_STEP rings up to SEARCH_MAX metres.
const SEARCH_LOOK = 2;
const SEARCH_STEP = 3;
const SEARCH_MAX = 15;
// Note: seconds a deputy who had to put the sheriff down waits before judging a lift again.
const CARRY_COOLDOWN = 2;
// Note: a crawl is not walking, so it neither withdraws nor carries.
export const walks = (cap) => cap.canMove && cap.mobility >= 0.5;
const fitToCarry = (cap) => walks(cap) && cap.rifleOk;
// Note: how far off the line to the sheriff the deputy may look, well inside his half view.
const EYE_MARGIN = 0.6;
// Note: a look at an opening may turn this far off the line to the sheriff, which still keeps him inside the view.
const SCAN_MARGIN = 0.8;
// Note: a look takes in the cells and doorways within this many radians of its facing.
const SWEEP_ARC = 0.5;
// Note: a doorway needs this many seconds of looking, and a sweep is over when this share of the cells has been seen.
const SWEEP_DWELL = 0.5;
const SWEEP_SEEN = 0.9;
// Note: a cell unseen while faced this long is skipped, and a sweep ends after SWEEP_MAX seconds.
const SWEEP_GIVE_UP = 1.2;
const SWEEP_MAX = 14;
// Note: a fall back watches the way it came from for this many seconds.
const WATCH_TIME = 4;
// Note: a deputy closer than PRESSED metres to a lawman in his way, and stuck for PRESSED_WAIT seconds, slips round him.
const PRESSED = 0.8;
const PRESSED_WAIT = 0.5;
// Note: a standing place closer than this to a lawman is taken.
const BODY_WIDTH = 1.1;
// Note: tuning of the search for a lost sheriff in regainContact.
const LOST_CONTACT = 2;
const TRAIL_START = 3.2;
const TRAIL_LEAD = 3;
const TRAIL_TIME = 6;
const LOOK_TURN = 1.6;
const LOOK_TIME = 4;
const TRAIL_REACH = 6;
// Note: a follower this many metres behind the sheriff stands up to catch up.
const CATCH_UP = 4;
// Note: an order without a post looks again every REPOST_EVERY seconds, and Cover follows the sheriff past COVER_REACH metres.
const REPOST_EVERY = 1;
const COVER_REACH = 8;
// Note: a pushed or retreating deputy has arrived this close to his spot, in metres.
const ARRIVED = 0.5;
// Note: a deputy at a push or retreat post stays within this many metres of it.
const POST_TETHER = 1.2;
// Note: after FUTILE_STEPS firing steps without a shot he stops sidestepping for FUTILE_PAUSE seconds.
const FUTILE_STEPS = 3;
const FUTILE_PAUSE = 6;
// Note: after a shot or firing step a pushing deputy fights from where he is this many seconds.
const FIGHT_STICK = 3;
// Note: a push with no zone left to enter holds its post this many seconds before sweeping again.
const EXHAUSTED_HOLD = 5;
// Note: seconds the gun stays free after hostile fire or a shout, or after a lawman fired or was hit.
const ROE_MEMORY = 6;
// Note: the deputy joins a fight the sheriff opened after this many seconds, a human reaction to the first shot.
const JOIN_DELAY = [0.3, 0.6];
// Note: an unaware hostile this close to a lawman and turned toward him is about to find him, so waiting is over.
const IMMINENT_RANGE = 3;
// Note: distances and times of the junior's role covering approaches beside a senior teammate.
const TEAM_COVER_NEAR = 6;
const TEAM_COVER_FAR = 8;
const TEAM_COVER_HOLD = 1.5;
const TEAM_COVER_REPOST = 4;
// Note: the deputy points out the same hostile no more often than this.
const POINT_EVERY = 8;
// Note: an autonomous teammate calls out an unaware hostile within this many metres, at most once per CHALLENGE_EVERY seconds.
const CHALLENGE_RANGE = 25;
const CHALLENGE_EVERY = 8;
// Note: bounding: a junior waits at most BOUND_WAIT seconds for a moving senior to stop, then moves for BOUND_GO seconds before judging again.
const BOUND_WAIT = 4;
const BOUND_GO = 2;
// Note: a target a seen teammate faces within this many radians is his, so another teammate prefers a different one.
const SPLIT_ARC = 0.2;

export function think(sim, a) {
  remember(sim, a);
  a.ai.approach = 'hold';
  if (a.withdrawn || a.status !== 'ok') return I();
  const cap = capability(a);
  if (a.carrying && !fitToCarry(cap)) {
    sim.releaseCarry(a, 'unable');
    a.ai.fleeing = null;
    a.ai.carryCooldown = sim.time + CARRY_COOLDOWN;
  }
  // Note: a withdrawal stops where the legs give out, and the deputy fights on from there.
  if (a.ai.fleeing === 'retreat' && !walks(cap)) a.ai.fleeing = null;
  if (a.passive && !walks(cap)) return I({ fire: false });
  let intent;
  if (a.role === 'hostile') intent = thinkHostile(sim, a);
  else if (a.role === 'deputy' && a.passive) intent = unfitDeputy(sim, a);
  else if (a.role === 'deputy') intent = thinkDeputy(sim, a);
  else if (a.role === 'civilian') intent = thinkCivilian(sim, a);
  else return I();
  if (a.role === 'hostile' || (a.role === 'deputy' && !a.passive)) intent = weaponTask(sim, a, intent);
  // Note: a deputy who cannot walk stays where he is, without crawling (item 438).
  if (a.role === 'deputy' && !walks(cap)) return { ...intent, goal: null, move: null };
  return intent;
}

function nearMissMove(sim, a) {
  const miss = a.ai.nearMiss;
  if (miss && sim.time - miss.t < 3 && a.traits.nerve < 0.35) {
    if (a.ai.missFor !== miss.t) {
      a.ai.missFor = miss.t;
      a.ai.missCover = coverFrom(sim, a, miss, 6);
    }
    const spot = a.ai.missCover;
    if (spot && dist(a, spot) > 0.8) return I({ goal: { ...spot, r: 0.4, windows: false }, mode: 'sprint', fire: false });
  }
  return null;
}

function opponents(sim, a) {
  if (a.role === 'hostile') return sim.lawmen.filter((o) => o.status === 'ok' && !o.withdrawn);
  return sim.hostiles.filter((h) => h.status === 'ok' && !h.surrendered);
}

function visible(sim, a) {
  const out = opponents(sim, a).filter((o) => sim.sees(a, o));
  for (const o of out) a.known[o.id] = { x: o.x, y: o.y, f: o.floor, t: sim.time };
  return out.sort((p, q) => dist(a, p) - dist(a, q));
}

// Note: each sound is handed over once, so none made later in the listener's tick is lost.
function freshSounds(sim, a) {
  const now = sim.time;
  const fresh = a.heard.filter((h) => !h.done);
  for (const h of fresh) h.done = true;
  a.heard = a.heard.filter((h) => now - h.t < 10);
  return fresh;
}

// Note: the nearest open floor cell within rmax of a point that the actor can walk to, or null; a few tries only, nearest first.
function reachableNear(sim, a, p, rmax = 4) {
  const here = { x: a.x, y: a.y, f: a.floor };
  let tries = 0;
  for (const c of ringCells(Math.floor(p.x), Math.floor(p.y), rmax)) {
    const t = tileAt(sim.map, p.f, c.x, c.y);
    if (solidAt(sim.map, p.f, c.x, c.y) || isFlight(t) || t === T.DOOR) continue;
    const cell = { x: c.x + 0.5, y: c.y + 0.5, f: p.f };
    if (findPath(sim.map, here, cell, { windows: false })) return cell;
    if (++tries >= 12) break;
  }
  return null;
}

function openFloorCell(sim, f, x, y, rmax = 4) {
  for (const c of ringCells(Math.floor(x), Math.floor(y), rmax)) {
    const t = tileAt(sim.map, f, c.x, c.y);
    if (!solidAt(sim.map, f, c.x, c.y) && !isFlight(t) && t !== T.DOOR) return { x: c.x + 0.5, y: c.y + 0.5, f };
  }
  return null;
}

// Note: the nearest reachable free tile near `near` that the threat cannot see and `ok` accepts.
function coverFrom(sim, a, from, rmax = 5, near = a, ok = null) {
  const eye = from.eye || from;
  const cx = Math.floor(near.x);
  const cy = Math.floor(near.y);
  const spots = [];
  for (let dy = -rmax; dy <= rmax; dy++) {
    for (let dx = -rmax; dx <= rmax; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const t = tileAt(sim.map, a.floor, x, y);
      if (solidAt(sim.map, a.floor, x, y) || isFlight(t) || t === T.DOOR) continue;
      const d = Math.hypot(x + 0.5 - near.x, y + 0.5 - near.y);
      if (d > rmax || castRay(sim.map, a.floor, eye.x, eye.y, x + 0.5, y + 0.5).clear || (ok && !ok(x + 0.5, y + 0.5))) continue;
      spots.push({ x: x + 0.5, y: y + 0.5, f: a.floor, d });
    }
  }
  spots.sort((p, q) => p.d - q.d);
  const here = { x: a.x, y: a.y, f: a.floor };
  for (const c of spots) {
    const path = findPath(sim.map, here, c);
    if (path && path.length <= rmax * 2 + 3) return c;
  }
  return null;
}

function unfitDeputy(sim, a) {
  const ai = a.ai;
  if (sim.isSafe(a) && !ai.unfitStage) {
    ai.unfitStage = 'retreat';
    return I({ crouch: true, fire: false });
  }
  const sounds = freshSounds(sim, a).filter((h) => GUNFIRE.has(h.kind) || ALARM.has(h.kind));
  let threat = visible(sim, a)[0] || sounds.at(-1)?.pos;
  if (!ai.unfitStage) {
    const safe = safeSpot(sim, a);
    if (!threat) threat = { x: 2 * a.x - safe.x, y: 2 * a.y - safe.y };
    ai.unfitCover = coverFrom(sim, a, threat, 8);
    ai.unfitStage = ai.unfitCover ? 'cover' : 'retreat';
  }
  if (ai.unfitStage === 'cover') {
    if (dist(a, ai.unfitCover) > 0.3 && a.navState !== 'blocked') return I({ goal: { ...ai.unfitCover, r: 0.2, windows: false }, mode: 'sprint', fire: false });
    ai.unfitStage = 'retreat';
  }
  return I({ goal: { ...safeSpot(sim, a), f: 0, r: 0.15, windows: false }, mode: 'walk', fire: false });
}

// Note: allies as the actor knows them, in view now or where it last saw them.
function knownAllies(sim, a, list) {
  return list.filter((o) => o && o !== a).map((o) => (sim.sees(a, o) ? o : a.ai.people.get(o.id))).filter((o) => o && o.status !== 'dead');
}

function allyInLine(a, t, allies) {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  return allies.some((c) => {
    if (!c || c === a || c === t || c.status === 'dead' || c.floor !== a.floor) return false;
    const px = c.x - a.x;
    const py = c.y - a.y;
    const along = px * ux + py * uy;
    // Note: the margin grows with range, and an ally just behind the target counts because a miss goes on.
    const side = Math.abs(-px * uy + py * ux);
    if (along > 0.4 && along < d) return side < 0.5 + 0.08 * along;
    return along >= d && along < d + BACKSTOP && side < 0.45;
  });
}

// Note: the sim re-checks this every tick, because an intent outlives the think that made it.
export function muzzleBlocked(a, allies, range) {
  const ahead = { x: a.x + Math.cos(a.facing) * range, y: a.y + Math.sin(a.facing) * range };
  return allyInLine(a, ahead, allies);
}

// Note: a settled veteran may aim for the head (item 401).
const headAim = (a, intent) => a.traits.experience === 'veteran' && intent.steady && a.settle > 0.85 && a.hold > 0.7;

// Note: the shared trigger rule for hostiles and deputies.
function fireReady(sim, a, t, intent, armed, settled, allies) {
  const aligned = Math.abs(angleDiff(a.facing, Math.atan2(t.y - a.eye.y, t.x - a.eye.x))) < 0.1;
  return armed && sim.time >= a.ai.engageAt && aligned && settled && !lineBlocked(a, t, allies) && !!sim.exposedAim(a, t, intent.aimHigh);
}

// Note: checks the line to the target and the line the muzzle actually points along, since turning lags the aim.
function lineBlocked(a, t, allies) {
  return allyInLine(a, t, allies) || muzzleBlocked(a, allies, Math.max(dist(a, t), 2));
}

// Note: a foe is seen with his gun on the actor when he is braced, or a lawman, and faces him within AIMED_AT radians.
const aimsAt = (t, a) => (t.role !== 'hostile' || t.ai.state === 'engage') && Math.abs(angleDiff(t.facing, Math.atan2(a.y - t.y, a.x - t.x))) < AIMED_AT;

// Note: a foe with his gun on the actor is answered with the loaded gun in hand rather than a slower switch.
function pickWeapon(a, d, underGun = false) {
  const cap = capability(a);
  let best = -1;
  let score = -1;
  // Note: a teammate keeps the gun in hand across a band round the 6 m mark, so a fight at that range does not swap guns back and forth.
  const held = WEAPONS[a.weapons[a.cur]?.id]?.kind;
  const edge = a.role !== 'deputy' || !held ? 6 : held === 'rifle' ? 4.5 : 7.5;
  a.weapons.forEach((w, i) => {
    const def = WEAPONS[w.id];
    if (w.fault || w.loaded <= 0 || (def.kind === 'rifle' ? !cap.rifleOk : !cap.handgunOk)) return;
    let sc = def.kind === 'rifle' ? (d > edge ? 2 : 1) : d > edge ? 1 : 2;
    if (i === a.cur) sc += underGun ? 2 : 0.5;
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  return best;
}

// Note: switches to a loaded weapon or reloads, and tells whether a weapon can fire now.
function armWeapon(a, intent, d, underGun = false) {
  const best = pickWeapon(a, d, underGun);
  if (best >= 0) {
    if (best !== a.cur && !a.action) intent.switchTo = best;
    return best === a.cur;
  }
  const w = weaponOf(a);
  if (w && (a.ammo[w.ammoType] || 0) > 0) intent.reload = true;
  else {
    const other = a.weapons.findIndex((x, i) => i !== a.cur && (a.ammo[x.ammoType] || 0) > 0);
    if (other >= 0) intent.switchTo = other;
  }
  return false;
}

function topUp(a, intent) {
  const w = weaponOf(a);
  if (w && w.loaded < WEAPONS[w.id].cap && (a.ammo[w.ammoType] || 0) > 0) {
    intent.reload = true;
    return;
  }
  const cap = capability(a);
  const other = a.weapons.findIndex((gun, i) => i !== a.cur && usable(cap, gun) && gun.loaded < WEAPONS[gun.id].cap && (a.ammo[gun.ammoType] || 0) > 0);
  if (other >= 0 && !a.action) intent.switchTo = other;
}

const recentlyHit = (a, now, window = 3) => a.lastHitAt != null && now - a.lastHitAt < window;

// Note: fatigue slows a lawman through a.mods.think, which a hostile lacks.
const reactK = (a) => EXP[a.traits.experience].k * (a.role === 'deputy' ? DEPUTY_K : 1) * (a.mods?.think ?? 1);

// Note: noticing takes longer when relaxed, far away or off the gaze, scaled by the view-zone factor k.
function noticeTime(a, t, wary, u, k = 1) {
  const off = Math.min(1, Math.abs(angleDiff(a.facing, Math.atan2(t.y - a.eye.y, t.x - a.eye.x))) / FOV.half);
  const base = wary ? 0.25 : 0.45 + (a.dozing ? 0.35 : 0);
  // Note: item 467: a teammate's Awareness shortens noticing and recognition through a.mods.notice; a hostile has none.
  return (base + Math.min(0.3, 0.025 * Math.max(0, dist(a, t) - 5)) + 0.25 * off) * reactK(a) * (a.mods?.notice ?? 1) * (0.85 + 0.3 * u) * k;
}

// Note: a target in the mid or flank view is recognised more slowly (item 72), paced by the best-placed target seen.
function peripheralK(sim, a, sight) {
  const zones = sim.fovOf(a).zones;
  return Math.max(1, Math.min(...sight.map((t) => zones[Math.max(0, sim.seeZone(a, t))].delay)));
}

// Note: raising takes longer for a rifle and for an unalert actor.
function readyTime(a, wary, v) {
  const w = weaponOf(a);
  const rifle = !!w && WEAPONS[w.id].kind === 'rifle';
  return (rifle ? 0.45 : 0.35) * (wary ? 0.5 : 1) * reactK(a) * (0.85 + 0.3 * v);
}

// Note: true once the actor has noticed what it sees, starting over after sight is lost for a moment.
function noticing(sim, a, sight, wary) {
  const ai = a.ai;
  const now = sim.time;
  if (!sight.length) {
    if (ai.noticeAt != null && now - ai.sightAt > LOST_TRACK) ai.noticeAt = null;
    return false;
  }
  ai.sightAt = now;
  if (ai.noticeAt == null) {
    ai.noticeFrom = now;
    ai.noticeAt = now + noticeTime(a, sight[0], wary, sim.rand(), peripheralK(sim, a, sight));
  }
  if (now < ai.noticeAt) return false;
  ai.noticeAt = null;
  return true;
}

// Note: the weapon comes up and a decision beat follows, so aim settles only after the raise.
function startChain(sim, a, wary, target) {
  const ai = a.ai;
  const now = sim.time;
  const v = sim.rand();
  const ready = readyTime(a, wary, v);
  const turn = Math.abs(angleDiff(a.facing, Math.atan2(target.y - a.eye.y, target.x - a.eye.x))) / (a.role === 'deputy' ? 6 : 5);
  const raiseAt = Math.max(now, ai.startleUntil ?? now) + turn;
  ai.steadyFrom = raiseAt + ready;
  ai.engageAt = Math.max(raiseAt + ready + (0.1 + 0.2 * (1 - v)) * reactK(a), (ai.noticeFrom ?? now) + FIRST_SHOT_MIN[wary ? 'wary' : 'unaware']);
}

// Note: switching to a new target inside a firefight costs a short beat, not a whole new chain.
function retarget(sim, a) {
  const ai = a.ai;
  const now = sim.time;
  ai.engageAt = Math.max(ai.engageAt ?? 0, now + (0.2 + 0.3 * sim.rand()) * reactK(a));
}

function hostileContact(sim, a, target) {
  const ai = a.ai;
  if (ai.shouted && sim.time - (ai.contactAt ?? 0) < 5) return;
  if (ai.shouted && ai.contactPos && ai.contactTarget === target.id && dist(ai.contactPos, target) < 4) return;
  sim.say(a, ai.shouted ? 'Over there!' : 'Lawmen!', 'shout', { contact: { x: target.x, y: target.y, f: target.floor } });
  Object.assign(ai, { shouted: true, contactAt: sim.time, contactTarget: target.id, contactPos: { x: target.x, y: target.y } });
}

// Note: a sudden loud sound freezes an actor for a moment set by nerve and loudness.
function startle(sim, a, level, wary) {
  const loud = level >= 80 ? 1 : level >= 60 ? 0.6 : 0.35;
  a.ai.startleUntil = sim.time + (0.2 + 0.3 * (1 - a.traits.nerve)) * loud * (wary ? 0.6 : 1) * (0.85 + 0.3 * sim.rand());
}

const canReady = (a) => a.weapons.some((w) => usable(capability(a), w) && (w.loaded > 0 || (a.ammo[w.ammoType] || 0) > 0));

function watchedRoute(sim, a, destination) {
  const path = findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, destination, { windows: true });
  if (!path) return true;
  const watchers = a.ai.mind.threats;
  return [a, ...path].some((p) => watchers.some((t) => t.f === floorOf(p) &&
    castRay(sim.map, t.f, t.x, t.y, p.x, p.y).clear));
}

function weaponTask(sim, a, intent) {
  if (a.passive || a.ai.fleeing || a.carrying || a.surrendered || (a.broken || 0) > sim.time || a.ai.shaken) return intent;
  const cap = capability(a);
  const w = weaponOf(a);
  // Note: the most immediate believed threat, one seen this moment before the nearest.
  const from = [...a.ai.mind.threats].sort((p, q) => Number(q.t === sim.time) - Number(p.t === sim.time) || dist(a, p) - dist(a, q))[0];
  const exposed = (p) => from && from.f === floorOf(p) && castRay(sim.map, from.f, from.x, from.y, p.x, p.y).clear;
  if (w?.fault) {
    const next = a.weapons.findIndex((g) => g !== w && !g.fault && usable(cap, g) && g.loaded > 0);
    const clearTime = cap.canAct && usable(cap, w) ? w.fault : Infinity;
    if (next >= 0 && (clearTime === Infinity || (exposed(a) && WEAPONS[a.weapons[next].id].drawTime < clearTime)))
      return { ...intent, switchTo: next, fire: false, clearMisfire: false };
    if (clearTime < Infinity) return { ...intent, fire: false, clearMisfire: true, switchTo: undefined };
  }
  if (a.action) return intent;
  if (!canReady(a)) {
    const loot = scavengeIntent(sim, a);
    if (loot) {
      if (a.role !== 'hostile' || !watchedRoute(sim, a, loot.goal || { x: a.x, y: a.y, f: a.floor })) return { ...loot, fire: false };
    }
    const cover = from ? coverFrom(sim, a, from, 8) : null;
    const away = cover || safeSpot(sim, a);
    return watchedIntent(sim, a, 'fallback', I({ goal: { ...away, r: 0.4, windows: true }, mode: 'walk', crouch: true, fire: false }));
  }
  const loaded = a.weapons.findIndex((g) => !g.fault && usable(cap, g) && g.loaded > 0);
  if (loaded >= 0) return intent;
  const refill = a.weapons.findIndex((g) => !g.fault && usable(cap, g) && (a.ammo[g.ammoType] || 0) > 0);
  if (refill < 0) return intent;
  const out = { ...intent, fire: false, goal: undefined, move: null, ...(a.role === 'deputy' ? { crouch: true, lean: 0 } : {}) };
  if (refill !== a.cur) return { ...out, switchTo: refill };
  const cover = from ? coverFrom(sim, a, from, 5) : null;
  const path = cover && findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, cover, { windows: true });
  const def = WEAPONS[a.weapons[refill].id];
  const reloadExposure = exposed(a) ? def.reloadFirst + def.reloadPer * Math.min(def.cap, a.ammo[w.ammoType]) : 0;
  const movingExposure = path ? path.filter(exposed).length / Math.max(0.3, 2.5 * cap.mobility) : Infinity;
  if (cover && dist(a, cover) > 0.8 && path && movingExposure < reloadExposure && a.navState !== 'blocked')
    return { ...out, goal: { ...cover, r: 0.4, windows: true }, reload: false };
  return { ...out, reload: true };
}

function thinkHostile(sim, a) {
  const ai = a.ai;
  const ex = EXP[a.traits.experience];
  const now = sim.time;
  if (ai.homeFacing === undefined) ai.homeFacing = a.facing;
  a.dozing = ai.state === 'idle' && a.habit === 'sit' && !ai.wary;
  a.alert = ['engage', 'search', 'investigate'].includes(ai.state);
  // Note: a man who gave up stands with his hands up and never resists again (items 291 and 492).
  if (a.surrendered) return I({ fire: false, steady: false, act: 'surrender' });
  if (outdoors(sim) && !ai.moraleChecked && ai.state === 'engage') {
    const down = sim.hostiles.filter((h) => h.status !== 'ok').length;
    if (down >= sim.hostiles.length * OUT_BREAK_SHARE) {
      ai.moraleChecked = true;
      if (sim.rand() < 0.2 + 0.7 * (1 - a.traits.nerve)) a.broken = now + 6 + 6 * sim.rand();
    }
  }
  if ((a.broken ?? 0) > now) {
    ai.wasBroken = true;
    return hostileBroken(sim, a);
  }
  if (ai.wasBroken) {
    ai.wasBroken = false;
    ai.shaken = false;
    ai.shakenCover = null;
  }
  const missMove = nearMissMove(sim, a);
  if (missMove) return missMove;
  if (ai.fallen) {
    const p = ai.fallen;
    ai.fallen = null;
    ai.wary = true;
    if (ai.state !== 'engage') {
      ai.state = 'search';
      ai.pos = p;
      ai.arrivedAt = null;
    }
    return I({ face: Math.atan2(p.y - a.y, p.x - a.x), fire: false });
  }
  const seen = visible(sim, a);
  let alarm = null;
  let sus = null;
  for (const h of freshSounds(sim, a)) {
    if (h.srcRole === 'hostile' && !ALARM.has(h.kind)) continue;
    const nearbyAlarm = (h.kind === 'door' || h.kind === 'sprint') && h.floor === a.floor && dist(a, h.pos) <= 5;
    if (ALARM.has(h.kind) || h.level >= 55 || nearbyAlarm) {
      if (!alarm || alarmRank(h) > alarmRank(alarm) || (alarmRank(h) === alarmRank(alarm) && h.level > alarm.level)) alarm = h;
    } else if (!sus || h.level > sus.level) sus = h;
  }
  const wary = ai.wary || ai.state === 'suspicious' || ai.state === 'search' || ai.state === 'investigate';
  if (ai.state === 'engage' && ai.lostAt != null && now - ai.lostAt > LOST_TRACK) {
    ai.state = ai.approachBeforeLoss === 'hold' ? 'watch' : 'search';
    ai.pursuing = ai.state === 'search';
    ai.widen = null;
    ai.engageAt = Infinity;
    const last = a.known[ai.target];
    if (last) ai.pos = { x: last.x, y: last.y, f: last.f };
    ai.noticeAt = null;
    ai.arrivedAt = null;
  }
  if (seen.length && ai.state === 'engage') ai.sightAt = now;
  if (ai.state === 'engage' ? seen.length : noticing(sim, a, seen, wary)) {
    const allies = sim.hostiles.filter((o) => o !== a && sim.sees(a, o));
    const chosen = pickTarget(sim, a, seen, allies);
    seen.splice(seen.indexOf(chosen), 1); seen.unshift(chosen);
    if (ai.state !== 'engage') {
      ai.state = 'engage';
      ai.since = now;
      ai.wary = true;
      ai.rush = false;
      startle(sim, a, 60, wary);
      startChain(sim, a, wary, seen[0]);
      ai.engageAt = Math.max(ai.engageAt, ai.startleUntil);
      const coverChance = (outdoors(sim) ? OUT_COVER : { green: 0.2, seasoned: 0.5, veteran: 0.8 })[a.traits.experience];
      ai.engageCover = sim.rand() < coverChance ? coverFrom(sim, a, seen[0], Math.round((outdoors(sim) ? 6 : 4) + (1 - a.traits.nerve) * 3)) : null;
      ai.inCover = false;
    } else if (ai.target != null && ai.target !== seen[0].id) retarget(sim, a);
    hostileContact(sim, a, seen[0]);
    ai.target = seen[0].id;
    ai.lostAt = null;
    ai.approachBeforeLoss = ex.hold ? 'hold' : 'push';
  } else if (alarm && !(alarm.contact && ai.rush && ai.state === 'search' && now - ai.since < 3)) {
    // Note: a call heard while he is already running to a shot of his own hearing does not swap his own guess of the spot for the caller's.
    const quiet = ['idle', 'suspicious', 'investigate'].includes(ai.state);
    ai.pos = alarm.contact || { x: alarm.pos.x, y: alarm.pos.y, f: alarm.floor };
    ai.wary = true;
    if (quiet || ai.state === 'search') {
      startle(sim, a, alarm.level, wary);
      // Note: a shot, a cry or a comrade's call sends him running to the spot and hunting round it, and he then holds it.
      const rush = RUSH.has(alarm.kind) || (!!alarm.contact && alarm.srcRole === 'hostile');
      ai.pursuing = rush;
      ai.rush = rush;
      ai.alarmSpot = rush ? { ...ai.pos } : null;
      ai.widen = null;
      ai.rerouted = false;
      ai.bound = null;
      ai.boundUntil = null;
      ai.state = 'search';
      ai.since = now;
      ai.arrivedAt = null;
      // Note: the first who hears a shot or a cry calls it out, so the others who hear him converge on the spot too (item 407).
      if (quiet && (GUNFIRE.has(alarm.kind) || alarm.kind === 'cry') && now - (sim.hostileAlarmAt ?? -Infinity) > ALARM_CALL_GAP) {
        sim.hostileAlarmAt = now;
        sim.say(a, GUNFIRE.has(alarm.kind) ? 'Shots! Over there!' : 'Over there!', 'shout', { contact: { ...ai.pos } });
      }
    }
  } else if (sus) {
    if (ai.state === 'idle') {
      ai.state = 'suspicious';
      ai.since = now;
      ai.wait = 1.2 + sim.rand() * 2;
      ai.faceDir = sus.dir;
    }
    // Note: a faint noise does not pull a hostile off the spot of a gunshot or shout it is already heading to.
    if (ai.state !== 'search' && ai.state !== 'engage') ai.pos = { x: sus.pos.x, y: sus.pos.y, f: sus.floor };
  }
  if (ai.shaken) {
    const spot = ai.shakenCover;
    // Note: reaching the cover spot, or finding it blocked, ends the run.
    if (!spot || dist(a, spot) <= 0.3 || a.navState === 'blocked') ai.shaken = false;
    else return I({ goal: { ...spot, r: 0.2, windows: false }, mode: 'sprint', fire: false });
  }
  if (ai.state !== 'engage' && now < (ai.startleUntil ?? 0)) return I({ face: a.facing });
  if (ai.state !== 'engage' && disarmed(a) && looseWeapon(sim, a, 12)) return hostileDisarmed(sim, a, null, I());
  switch (ai.state) {
    case 'suspicious':
      if (now - ai.since > ai.wait) {
        ai.state = 'investigate';
        ai.since = now;
        ai.arrivedAt = null;
      }
      return I({ face: ai.faceDir });
    case 'investigate':
    case 'search':
      return hostileSeek(sim, a, ex);
    case 'watch':
      return watchedIntent(sim, a, 'hold', I({ steady: true }));
    case 'engage':
      return hostileEngage(sim, a, ex, seen);
    default:
      return hostileIdle(sim, a);
  }
}

function hostileIdle(sim, a) {
  const ai = a.ai;
  const now = sim.time;
  const intent = I();
  topUp(a, intent);
  // Note: a walker goes his round of the camp at a stroll and stops a few seconds at each point of it.
  if (a.habit === 'patrol' && a.route?.length && !ai.guardPost) {
    const k = ai.routeAt ?? 0;
    const p = a.route[k % a.route.length];
    if (a.floor === p.f && dist(a, p) < 0.7) {
      if (ai.routeWait == null) ai.routeWait = now + 2 + sim.rand() * 2.5;
      if (now < ai.routeWait) return { ...intent, face: ai.homeFacing + Math.sin(now * 0.6 + a.id) * 0.9 };
      ai.routeWait = null;
      ai.routeAt = k + 1;
      ai.homeFacing = a.facing;
    }
    return { ...intent, goal: { ...a.route[(ai.routeAt ?? 0) % a.route.length], r: 0.4, windows: false }, mode: 'slow' };
  }
  if (a.habit === 'pace' && !ai.guardPost) {
    if (!ai.paceGoal || a.navState === 'arrived' || now > ai.paceUntil) {
      const p = openFloorCell(sim, a.floor, a.home.x + (sim.rand() - 0.5) * 6, a.home.y + (sim.rand() - 0.5) * 6, 2);
      ai.paceGoal = p || { x: a.home.x, y: a.home.y, f: a.floor };
      ai.paceUntil = now + 4 + sim.rand() * 4;
    }
    return { ...intent, goal: { ...ai.paceGoal, r: 0.5, windows: false }, mode: 'slow' };
  }
  if (dist(a, a.home) > 0.8 && a.floor === a.home.floor) return { ...intent, goal: { x: a.home.x, y: a.home.y, f: a.home.floor, r: 0.5, windows: false }, mode: 'slow' };
  // Note: a sentry sweeps his front wider than a man idling at his place.
  return { ...intent, face: ai.homeFacing + Math.sin(now * 0.3 + a.id) * (a.campRole === 'sentry' ? 0.9 : 0.5) };
}

function hostileSeek(sim, a, ex) {
  const ai = a.ai;
  const now = sim.time;
  const intent = I({ mode: ai.rush ? 'sprint' : ex.sneak ? 'slow' : 'walk', crouch: !ai.rush && ex.sneak && ai.state === 'investigate' });
  topUp(a, intent);
  const pos = ai.pos;
  if (!pos) {
    ai.state = 'idle';
    return intent;
  }
  // Note: outdoors a run on a shot goes by bounds: from one cover to the next a few metres nearer the spot, a pause in each, until he is close.
  if (outdoors(sim) && ai.rush && a.floor === pos.f && dist(a, pos) > OUT_BOUND) {
    const b = ai.bound;
    if (b && dist(a, b) > 0.6 && a.navState !== 'blocked') return { ...intent, mode: 'sprint', crouch: false, goal: { ...b, r: 0.4, windows: false } };
    if (b && !ai.boundUntil) ai.boundUntil = now + OUT_PAUSE[0] + sim.rand() * (OUT_PAUSE[1] - OUT_PAUSE[0]);
    if (b && now < ai.boundUntil) return { ...intent, crouch: true, face: Math.atan2(pos.y - a.y, pos.x - a.x) };
    const k = Math.min(1, OUT_BOUND / dist(a, pos));
    const ahead = { x: a.x + (pos.x - a.x) * k, y: a.y + (pos.y - a.y) * k };
    const next = coverFrom(sim, a, pos, 3, ahead, (x, y) => Math.hypot(x - pos.x, y - pos.y) < dist(a, pos) - 1.5);
    ai.boundUntil = null;
    if (next) {
      ai.bound = next;
      return { ...intent, mode: 'sprint', crouch: false, goal: { ...next, r: 0.4, windows: false } };
    }
    ai.bound = null;
  }
  const arrived = a.navState === 'arrived' || (a.floor === pos.f && dist(a, pos) < 1.2);
  // Note: a spot he cannot reach is swapped once for the nearest one he can, so a guess inside a wall or behind a locked door does not end the search where he stands.
  if (!arrived && a.navState === 'blocked' && !ai.arrivedAt && !ai.rerouted) {
    ai.rerouted = true;
    const near = reachableNear(sim, a, pos);
    if (near) {
      ai.pos = near;
      a.nav = null;
      return { ...intent, goal: { ...near, r: 1, windows: false } };
    }
  }
  if ((arrived || a.navState === 'blocked') && !ai.arrivedAt) {
    ai.arrivedAt = now;
    ai.lookBase = a.facing;
    ai.rush = false;
  }
  if (ai.arrivedAt) {
    if (ai.pursuing && ai.mind.threats.length) return watchedIntent(sim, a, 'push', intent);
    if (ai.pursuing && now - ai.arrivedAt > SEARCH_LOOK && widenSearch(sim, a)) return { ...intent, goal: { ...ai.pos, r: 1, windows: false } };
    if (now - ai.arrivedAt > (ai.state === 'search' ? 6 : 3)) {
      if (ai.state === 'search') {
        ai.guardPost = true;
        // Note: a search sent by a shot or a cry ends holding a spot of its own beside where the alarm came from, so the men who came spread round it.
        const spot = ai.alarmSpot;
        const ang = a.id * 2.4;
        const post = spot && (reachableNear(sim, a, { x: spot.x + Math.cos(ang) * 1.5, y: spot.y + Math.sin(ang) * 1.5, f: spot.f }, 3) || reachableNear(sim, a, spot, 3));
        a.home = post ? { ...a.home, x: post.x, y: post.y, floor: post.f } : { ...a.home, x: a.x, y: a.y, floor: a.floor };
        ai.homeFacing = a.facing;
        ai.alarmSpot = null;
      }
      ai.state = 'idle';
      ai.arrivedAt = null;
      a.nav = null;
    }
    return { ...intent, face: (ai.lookBase ?? a.facing) + Math.sin((now - ai.arrivedAt) * 1.4) * 0.8, crouch: false };
  }
  return { ...intent, goal: { ...pos, r: 1, windows: false } };
}

// Note: a pursuer who finds nobody tries an unseen spot one ring farther out each time, up to SEARCH_MAX.
function widenSearch(sim, a) {
  const ai = a.ai;
  const w = (ai.widen ||= { x: ai.pos.x, y: ai.pos.y, f: ai.pos.f, r: 0 });
  const here = { x: a.x, y: a.y, f: a.floor };
  while (w.r < SEARCH_MAX) {
    w.r += SEARCH_STEP;
    const turn = sim.rand() * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const ang = turn + (k * Math.PI) / 4;
      const p = openFloorCell(sim, w.f, w.x + Math.cos(ang) * w.r, w.y + Math.sin(ang) * w.r, 1);
      if (!p || (p.f === a.floor && sim.pointVisible(a, p.x, p.y)) || !findPath(sim.map, here, p, { windows: false })) continue;
      ai.pos = p;
      ai.arrivedAt = null;
      ai.rerouted = false;
      return true;
    }
  }
  return false;
}

function hostileEngage(sim, a, ex, seen) {
  const ai = a.ai;
  const now = sim.time;
  if (!seen.length) {
    if (ai.lostAt == null) ai.lostAt = now;
    const last = a.known[ai.target];
    if (ai.approachBeforeLoss === 'hold') return watchedIntent(sim, a, 'hold', I({ steady: true }));
    // Note: outdoors a man in cover who has lost sight steps out a pace or two where he would see his man again, rather than leave the cover to hunt.
    if (outdoors(sim) && ai.inCover && now - ai.lostAt < OUT_PEEK) {
      const t = sim.byId(ai.target);
      const intent = I({ steady: ex.steady, crouch: true });
      topUp(a, intent);
      const step = t && t.status === 'ok' && fireStep(sim, a, t, knownAllies(sim, a, sim.hostiles));
      if (step) intent.goal = { ...step, r: 0.2, windows: false };
      else if (last) intent.face = Math.atan2(last.y - a.y, last.x - a.x);
      return intent;
    }
    if (now - ai.lostAt > 1.2 && last) {
      ai.pursuing = true;
      ai.widen = null;
      ai.state = 'search';
      ai.pos = { x: last.x, y: last.y, f: last.f };
      ai.since = now;
      ai.arrivedAt = null;
    } else if (now - ai.lostAt > 1.2) ai.state = 'idle';
    const intent = I({ steady: ex.steady });
    if (last && now - ai.lostAt < 1.2) intent.face = Math.atan2(last.y - a.y, last.x - a.x);
    topUp(a, intent);
    return intent;
  }
  const t = seen[0];
  const d = dist(a, t);
  const intent = I({ targetId: t.id, mode: 'walk', steady: ex.steady && d > 5 && now >= (ai.steadyFrom ?? 0), crouch: ex.crouch && d > 3 });
  intent.aimHigh = headAim(a, intent);
  if (disarmed(a)) return hostileDisarmed(sim, a, t, intent);
  const armed = armWeapon(a, intent, d, aimsAt(t, a));
  // Note: outdoors a man who has reached cover fights from it and does not walk out into the open at his man.
  if (!ex.hold && d > 8 && !(outdoors(sim) && ai.inCover)) intent.goal = { x: t.x, y: t.y, f: t.floor, r: 7, windows: false };
  if (ai.engageCover && dist(a, ai.engageCover) > 0.8 && a.navState !== 'blocked') {
    intent.goal = { ...ai.engageCover, r: 0.4, windows: false };
    intent.mode = 'sprint';
  } else {
    if (ai.engageCover) ai.inCover = true;
    ai.engageCover = null;
  }
  if (outdoors(sim) && ai.inCover) intent.crouch = true;
  const friends = knownAllies(sim, a, sim.hostiles);
  // Note: a settled shot is worth waiting for only at range, and someone just hit fires from the hip.
  intent.fire = fireReady(sim, a, t, intent, armed, d < 6 || !ex.steady || a.settle > 0.5 || recentlyHit(a, now), friends);
  intent.guard = friends;
  if (!intent.goal && !sim.exposedAim(a, t, intent.aimHigh)) {
    const post = fireStep(sim, a, t, friends);
    if (post) intent.goal = { ...post, r: 0.2, windows: true };
  }
  if (recentlyHit(a, now)) hostileHurt(sim, a, t, intent);
  return intent;
}

// Note: no carried gun the arms can fire.
function disarmed(a) {
  const cap = capability(a);
  return cap.canAct && !a.weapons.some((w) => usable(cap, w));
}

// Note: the nearest loose weapon the actor could fire, within reach of a walk.
function looseWeapon(sim, a, range) {
  let best = null;
  let bd = range;
  for (const it of sim.items) {
    const d = it.floor === a.floor ? dist(a, it) : Infinity;
    if (d < bd && goalAvailable(sim, a, { ...it, f: it.floor }) && itemWanted(a, it) && sim.pointVisible(a, it.x, it.y) && findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, { x: it.x, y: it.y, f: it.floor }, { windows: true })) {
      best = it;
      bd = d;
    }
  }
  return best;
}

// Note: a disarmed hostile fetches an unwatched loose gun or ducks into cover, and never fires.
function hostileDisarmed(sim, a, t, intent) {
  const ai = a.ai;
  const lawmen = knownLawmen(a);
  const watcher = lawmen.find((l) => l.f === a.floor && castRay(sim.map, a.floor, l.x, l.y, a.x, a.y).clear);
  const it = looseWeapon(sim, a, 10);
  intent.fire = false;
  intent.steady = false;
  intent.crouch = true;
  if (it && !watcher && !watchedRoute(sim, a, { ...it, f: it.floor })) {
    if (dist(a, it) < 1) {
      intent.use = { type: 'scavenge', itemId: it.id, edge: true };
      intent.face = Math.atan2(it.y - a.y, it.x - a.x);
      return intent;
    }
    intent.goal = { x: it.x, y: it.y, f: it.floor, r: 0.8, windows: false };
    intent.mode = 'walk';
    return intent;
  }
  const threat = t || watcher;
  if (threat && (ai.duck?.from !== threat.id || sim.time >= ai.duck.until)) ai.duck = { from: threat.id, spot: coverFrom(sim, a, threat, 8), until: sim.time + 8 };
  if (ai.duck?.spot && sim.time < ai.duck.until && dist(a, ai.duck.spot) > 0.8) {
    intent.goal = { ...ai.duck.spot, r: 0.4, windows: false };
    intent.mode = 'sprint';
  }
  return intent;
}

// Note: after a hit the shaken run for cover and the rest return fire crouched.
function hostileHurt(sim, a, t, intent) {
  const ai = a.ai;
  intent.crouch = true;
  intent.steady = false;
  intent.aimHigh = false;
  const cap = capability(a);
  const shaken = a.traits.nerve < 0.35 || a.wounds.length >= 2 || cap.mobility < 0.5 || a.wounds.some((w) => w.severe);
  if (!shaken) return;
  if (ai.shakenFor !== a.lastHitAt) {
    ai.shakenFor = a.lastHitAt;
    ai.shakenCover = coverFrom(sim, a, t, 5);
    // Note: with no cover in reach there is nowhere to run, so he returns fire crouched like the steady.
    ai.shaken = !!ai.shakenCover;
  }
  if (!ai.shaken) return;
  intent.goal = { ...ai.shakenCover, r: 0.2, windows: false };
  intent.mode = 'sprint';
  intent.fire = false;
}

// Note: a broken hostile holds fire, runs to cover out of the lawmen's sight and goes to ground there.
function hostileBroken(sim, a) {
  const ai = a.ai;
  const seen = visible(sim, a);
  const t = seen[0] || a.known[ai.target] || ai.mind.threats[0] || { x: a.x - Math.cos(a.facing) * 5, y: a.y - Math.sin(a.facing) * 5 };
  if (ai.brokenFor !== a.broken) {
    ai.brokenFor = a.broken;
    ai.brokenCover = coverFrom(sim, a, t, 8, a, (x, y) => !knownLawmen(a).some((l) => l.floor === a.floor && castRay(sim.map, a.floor, l.x, l.y, x, y).clear));
  }
  // Note: he runs upright to cover, because a crouched man only creeps, and goes to ground once there.
  const running = !!ai.brokenCover && dist(a, ai.brokenCover) > 0.8;
  const intent = I({ crouch: !running, steady: false, fire: false });
  if (running) {
    intent.goal = { ...ai.brokenCover, r: 0.4, windows: false };
    intent.mode = 'sprint';
  } else if (seen.length) intent.face = Math.atan2(seen[0].y - a.y, seen[0].x - a.x);
  return intent;
}

function goalAvailable(sim, a, p) {
  const old = a.ai.abandonedGoal;
  return !old || sim.time >= old.until || floorOf(p) !== old.f || dist(old, p) > 1;
}

function thinkCivilian(sim, a) {
  const ai = a.ai;
  const now = sim.time;
  a.alert = ai.state === 'panic';
  for (const h of freshSounds(sim, a)) {
    if (ALARM.has(h.kind) || h.level >= 60) {
      if (ai.state !== 'panic') {
        ai.state = 'panic';
        ai.since = now;
        startle(sim, a, h.level, false);
      }
      ai.danger = { ...h.pos, floor: h.floor };
    }
  }
  if (ai.state === 'panic' && now < (ai.startleUntil ?? 0)) return I({ face: a.facing });
  if (ai.state !== 'panic') return I({ face: a.home.facing ?? a.facing });
  // Note: an exit the sim marked abandoned for lack of progress is given up for EXIT_GIVE_UP seconds.
  const bad = (ai.badExits ||= new Map());
  const cell = (p) => `${Math.floor(p.x)}:${Math.floor(p.y)}`;
  if (ai.abandonedGoal && now < ai.abandonedGoal.until) bad.set(cell(ai.abandonedGoal), now + EXIT_GIVE_UP);
  const exitOpen = (p) => !((bad.get(cell(p)) ?? 0) > now);
  const armed = sim.actors.find((o) => o !== a && o.status === 'ok' && o.floor === a.floor && weaponOf(o) && dist(a, o) < 2.5 && sim.sees(a, o));
  if (armed) {
    ai.mode = 'freeze';
    return I({ face: Math.atan2(armed.y - a.y, armed.x - a.x), act: 'surrender' });
  }
  if (sim.isSafe(a)) { ai.mode = 'hide'; return I({ crouch: true }); }
  if (sim.house.kind === 'outdoor') {
    const candidates = [
      { x: 1.5, y: a.y, f: a.floor }, { x: sim.map.W - 1.5, y: a.y, f: a.floor },
      { x: a.x, y: 1.5, f: a.floor }, { x: a.x, y: sim.map.H - 1.5, f: a.floor },
    ].filter((p) => exitOpen(p) && goalAvailable(sim, a, p) && dist(a, p) <= 10 && (!ai.danger || ai.danger.floor !== a.floor || dist(p, ai.danger) > dist(a, ai.danger)))
      .sort((p, q) => dist(a, p) - dist(a, q));
    const exit = candidates.find((p) => !solidAt(sim.map, p.f, Math.floor(p.x), Math.floor(p.y)) && findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, p, { windows: false }));
    if (exit) {
      ai.mode = 'flee';
      return I({ goal: { ...exit, r: 0.8, windows: false }, mode: 'sprint' });
    }
  }
  const exits = sim.house.entries.filter((e) => e.kind === 'door' && stateAt(sim.map, 0, e.x, e.y) !== DS.LOCKED);
  const safeExits = exits.filter((e) => exitOpen({ x: e.outside.x + 0.5, y: e.outside.y + 0.5 }) && goalAvailable(sim, a, { x: e.outside.x + 0.5, y: e.outside.y + 0.5, f: 0 }) && dist(a, e.outside) <= 10 && (!ai.danger || ai.danger.floor !== a.floor || dist(e.outside, ai.danger) > dist(a, ai.danger)));
  safeExits.sort((p, q) => dist(a, p.outside) - dist(a, q.outside));
  const e = safeExits.find((exit) => findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, { x: exit.outside.x + 0.5, y: exit.outside.y + 0.5, f: 0 }, { windows: false }));
  if (!e) { ai.mode = 'hide'; return I({ crouch: true }); }
  ai.mode = 'flee';
  return I({ goal: { x: e.outside.x + 0.5, y: e.outside.y + 0.5, f: 0, r: 0.8, windows: false }, mode: 'sprint' });
}

// Note: teammate tactics (items 20, 77, 171, 421, 425, 433, 436): firing positions in cover, peeking, cautious movement, doorway pies and covering fire, each scaled by the teammate's tactical sense.
// Note: a teammate weighs his firing position again every TAC_LOOK seconds, slower unskilled and quicker skilled.
const TAC_LOOK = [1.4, 0.6];
// Note: a held post lets a man shift as far as its firing steps do to fight from cover (item 413).
const POST_SHIFT = POST_TETHER;
// Note: the furthest a man goes for a firing position, unskilled and skilled.
const TAC_REACH = [2.5, 5.5];
// Note: how long a firing position is kept on a threat out of sight, and how long a push waits on one that watches its way.
const TAC_HOLD = [3, 9];
const PUSH_PATIENCE = [3, 12];
// Note: a sighting this many seconds old still stops a push that it watches, unskilled and skilled.
const PUSH_WARY = [4, 12];
// Note: a man fired on ducks this long before he looks out again, more if his nerve is weak.
const DUCK = [0.5, 1.4];
// Note: an unseen shooter is watched for this long after his shot.
const UNDER_FIRE_LOOK = [2, 5];
// Note: the look at each station of a doorway pie, slow and quick, and how long a push watches an unaware hostile before it goes on.
const PIE_DWELL = [0.7, 0.35];
const OVERWATCH_PATIENCE = [4, 14];
// Note: a route this exposed to a live threat is crossed at a run, and a withdrawal waits in cover at most this long for a lull.
const RUN_RISK = 0.25;
const BOUND_PATIENCE = [2, 8];

const lerpS = ([lo, hi], k) => lo + (hi - lo) * k;

export function tacOf(a) {
  if (!a.ai.tac) a.ai.tac = { sense: tacticalSense(a), spot: null, lookAt: 0, pied: new Set() };
  return a.ai.tac;
}

const dropSpot = (tac) => {
  if (tac) tac.spot = null;
  return null;
};

// Note: where an order lets a teammate take a firing position: round his post under Hold or a reached Fall back post, near the sheriff under Cover, near himself under Push or on his own; none while a Fall back is still on its way (item 413).
function fightArea(sim, a, s, sense) {
  const ai = a.ai;
  const o = ai.order?.accepted ? ai.order : null;
  const reach = lerpS(TAC_REACH, sense);
  if (ai.state === 'holding' && ai.holdSpot) {
    const post = ai.holdSpot;
    return { anchor: post, radius: POST_SHIFT, ok: (p) => p.f === post.f && sameZone(sim, p, post) };
  }
  if (o?.kind === 'fallback') {
    if (o.arrivedAt == null || !o.spot) return null;
    return { anchor: o.spot, radius: POST_SHIFT, ok: (p) => p.f === o.spot.f && sameZone(sim, p, o.spot) };
  }
  if (o?.kind === 'push' || ai.autonomous) return { anchor: a, radius: reach };
  // Note: Cover, ordered or initial, fights within the reach it follows the sheriff at.
  if (s.status === 'ok' && floorOf(s) === a.floor) return { anchor: a, radius: reach, ok: (p) => Math.hypot(p.x - s.x, p.y - s.y) <= COVER_REACH - 1 };
  return { anchor: a, radius: Math.min(reach, 3) };
}

// Note: the other lawmen where this one knows them to stand, and the lanes the ones he sees face along, which a firing position keeps off (items 77 and 421).
const bodiesOf = (a) => knownLawmen(a).filter((p) => p.id !== a.id && !p.passive).map((p) => ({ x: p.x, y: p.y, f: floorOf(p) }));
function lanesOf(sim, a) {
  return sim.lawmen.filter((o) => o !== a && o.status === 'ok' && !o.withdrawn && o.floor === a.floor && sim.sees(a, o))
    .map((o) => [{ x: o.eye.x, y: o.eye.y, f: o.floor }, { x: o.eye.x + Math.cos(o.facing) * 12, y: o.eye.y + Math.sin(o.facing) * 12, f: o.floor }]);
}

function chooseSpot(sim, a, tac, target, area, want = 'fight', extra = {}) {
  const now = sim.time;
  tac.lookAt = now + lerpS(TAC_LOOK, tac.sense);
  // Note: the misjudgement noise is a hash of the seed, the man and the second, so it varies between plays and leaves sim.rand alone.
  tac.spot = fightingSpot(sim, a, { target, threats: a.ai.threats || [], ...area, sense: tac.sense, want, bodies: bodiesOf(a), lanes: lanesOf(sim, a), salt: `${sim.seed}:spot:${a.id}:${Math.floor(now)}`, ...extra });
  // Note: a man on his way to a firing position keeps to it until he is there, held up or overdue, so he does not stop halfway in the open.
  tac.arriveBy = now + (tac.spot.here ? 0 : dist(a, tac.spot) / 1.2 + 1.5);
  return tac.spot;
}

// Note: whether to weigh the firing position again: none yet, held up or overdue on the way, or standing on it with the look due or a new man to fight.
function needSpot(sim, a, tac, id) {
  const spot = tac.spot;
  if (!spot) return true;
  if (!spot.here && !spot.reached && spot.f === a.floor) return a.navState === 'blocked' || sim.time > (tac.arriveBy ?? 0);
  return sim.time >= tac.lookAt || tac.spotFor !== id;
}

// Note: how hard a target presses a teammate: a man with his gun on him, or firing, makes a long move to cover costly, and a ready shot of his own is worth keeping.
function pressure(sim, a, t) {
  const now = sim.time;
  const on = aimsAt(t, a) || now - (t.lastFiredAt ?? -99) < 2 ? 1 : 0;
  const ready = now >= (a.ai.engageAt ?? Infinity) && a.settle > 0.45 ? 1 : 0;
  return { pressure: on, ready };
}

// Note: the path the actor walks to a goal, the navigation's own when it leads there, else one found at most once a second.
function pathTo(sim, a, goal) {
  const gk = goalKey(goal);
  if (a.nav?.gk === gk && a.nav.path) return a.nav.path;
  const tac = tacOf(a);
  if (tac.path?.gk === gk && sim.time < tac.path.until) return tac.path.path;
  const path = findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, goal, { windows: goal.windows !== false });
  tac.path = { gk, path, until: sim.time + 1 };
  return path;
}

// Note: at his firing position he shows himself to shoot, round the corner or over the cover, and keeps behind it while he works the gun or ducks a near miss; on the way there he runs if it is more than a step.
function atSpot(sim, a, tac, intent, quiet = false) {
  const spot = tac.spot;
  if (!spot) return intent;
  const away = spot.f !== a.floor ? Infinity : dist(a, spot);
  if (!spot.here && away > 0.3) {
    const run = !quiet && away > 1.5 && tac.sense >= 0.3 && capability(a).mobility >= 0.6 && !a.action;
    return { ...intent, goal: { x: spot.x, y: spot.y, f: spot.f, r: 0.2, windows: false }, move: null, mode: run ? 'sprint' : quiet ? 'slow' : 'walk',
      crouch: !run && (quiet || !!intent.crouch), lean: 0, fire: run ? false : !!intent.fire, tactical: true };
  }
  // Note: the next look at his position is timed from when he stands on it.
  if (!spot.here && !spot.reached && away <= 0.08) {
    spot.reached = true;
    tac.lookAt = sim.time + lerpS(TAC_LOOK, tac.sense);
  }
  // Note: ducking is worth it only where it hides more of him than the stance he shoots from.
  const cover = spot.lean !== 0 || spot.stance === 'stand' || (spot.ducked ?? 1) < 0.5;
  const busy = cover && (['reload', 'switch', 'clearMisfire'].includes(a.action?.type) || !!intent.reload || intent.switchTo !== undefined);
  const out = !busy && (!cover || sim.time >= (tac.duckUntil ?? 0));
  const held = { ...intent, crouch: spot.stance === 'stand' ? !out : true, lean: out ? spot.lean : 0, fire: out && !!intent.fire, tactical: true };
  // Note: he steps the last hand's breadth onto the spot itself, where its lines were judged, unless a firing step already moves him.
  if (away > 0.08 && spot.f === a.floor && !held.goal && !held.move && !a.action) held.goal = { x: spot.x, y: spot.y, f: spot.f, r: 0.05, windows: false };
  return intent.targetId != null ? held : glance(sim, a, tac, held);
}

// Note: holding still, a teammate glances now and then at a fresh noise or a believed hostile out of his view, the skilled more often; a glance never interrupts a shot (items 424 and 428).
const GLANCE = [5, 1.6];
function glance(sim, a, tac, intent) {
  const now = sim.time;
  if (intent.fire || intent.goal || intent.move) return intent;
  if (now < (tac.glanceUntil ?? 0)) return { ...intent, face: tac.glanceDir };
  if (now < (tac.glanceNext ?? 0)) return intent;
  tac.glanceNext = now + lerpS(GLANCE, tac.sense);
  const facing = intent.face ?? a.facing;
  const near = (a.ai.threats || []).filter((q) => q.f === a.floor && now - q.t < 4 && Math.hypot(q.x - a.x, q.y - a.y) < 12 &&
    Math.abs(angleDiff(facing, Math.atan2(q.y - a.y, q.x - a.x))) > 0.9).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
  if (!near.length) return intent;
  tac.glanceDir = Math.atan2(near[0].y - a.y, near[0].x - a.x);
  tac.glanceUntil = now + 0.6;
  return { ...intent, face: tac.glanceDir };
}

// Note: a hostile sound out of his view turns a teammate's head toward it while it is fresh, the skilled sooner and to fainter, farther sounds (item 73); never while he fires at a man he sees.
function turnToNoise(sim, a, intent) {
  const n = a.ai.noise;
  if (!intent || !n || n.f !== a.floor || intent.fire || intent.targetId != null) return intent;
  const tac = tacOf(a);
  if (sim.time - n.t > 0.8 + 1.2 * tac.sense || Math.hypot(n.x - a.x, n.y - a.y) > 6 + 8 * tac.sense) return intent;
  const dir = Math.atan2(n.y - a.y, n.x - a.x);
  return Math.abs(angleDiff(intent.face ?? a.facing, dir)) < 0.8 ? intent : { ...intent, face: dir };
}

// Note: a near miss or a hit sends a teammate who is fighting from cover down behind it for a moment.
function duckOnFire(sim, a, tac) {
  const now = sim.time;
  const shot = Math.max(a.ai.nearMiss?.t ?? -Infinity, a.lastHitAt ?? -Infinity);
  if (shot > (tac.duckFor ?? -Infinity) && now - shot < 0.5) {
    tac.duckFor = shot;
    tac.duckUntil = now + lerpS(DUCK, 1 - a.traits.nerve);
    tac.lookAt = Math.min(tac.lookAt, now + 0.3);
  }
}

// Note: in contact a teammate fights from the best firing position near him: round a corner with only the head out, over low cover, or crouched off the lanes the other threats watch; the skilled take one at once, the others once he is fired on or covered by a gun.
function tacticalEngage(sim, a, s, t, intent) {
  const ai = a.ai;
  const tac = tacOf(a);
  const now = sim.time;
  const pressed = recentlyHit(a, now, 3) || now - (ai.nearMiss?.t ?? -99) < 3 || aimsAt(t, a) || now - (t.lastFiredAt ?? -99) < 2;
  if (tac.sense < 0.35 && !pressed && !tac.spot) return intent;
  const area = fightArea(sim, a, s, tac.sense);
  if (!area) return intent;
  duckOnFire(sim, a, tac);
  if (needSpot(sim, a, tac, t.id)) {
    tac.spotFor = t.id;
    chooseSpot(sim, a, tac, { x: t.x, y: t.y, f: t.floor, stance: t.stance }, area, 'fight', pressure(sim, a, t));
  }
  tac.holdUntil = now + lerpS(TAC_HOLD, tac.sense);
  return atSpot(sim, a, tac, intent);
}

// Note: with his man out of sight a teammate keeps his firing position while the threat is live, looking out again after a duck, and gives it up when the threat is stale, his time is out, or his order calls him away (items 425, 427, 433).
function tacticalHold(sim, a, s) {
  const ai = a.ai;
  const tac = ai.tac;
  const now = sim.time;
  if (!tac?.spot || now > (tac.holdUntil ?? 0)) return dropSpot(tac);
  // Note: a push fights from where it stands only for the few seconds after a shot or a firing step, then pursues (items 427 and 433).
  if (ai.order?.accepted && ai.order.kind === 'push' && !ai.order.own && now >= (ai.fightUntil ?? 0)) return dropSpot(tac);
  const area = fightArea(sim, a, s, tac.sense);
  if (!area || (area.ok && !area.ok(tac.spot))) return dropSpot(tac);
  const hot = (ai.threats || []).find((q) => q.live && q.f === a.floor);
  if (!hot) return dropSpot(tac);
  // Note: a position that gives no cover is not worth keeping once his man is out of sight; standing in the open waiting is how a man is shot from where he is not looking.
  const spot = tac.spot;
  if (!spot.lean && spot.stance !== 'stand' && (spot.ducked ?? 1) >= 0.5) return dropSpot(tac);
  duckOnFire(sim, a, tac);
  const out = atSpot(sim, a, tac, I({ steady: true, crouch: true, face: Math.atan2(hot.y - a.y, hot.x - a.x), fire: false }));
  return ai.order?.kind === 'cover' || !ai.order?.accepted ? watchSheriff(sim, a, sheriffEstimate(sim, a), out, 3) : out;
}

// Note: fired on by a man he cannot see, a teammate turns to where the shot came from and gets off the spot into cover from that way; item 409 still drives the low-nerve into cover first.
function underFire(sim, a, s) {
  const ai = a.ai;
  const tac = tacOf(a);
  const now = sim.time;
  if (tac.sense < 0.3) return null;
  const hit = recentlyHit(a, now, 1) && a.lastShotDirection != null
    ? { t: a.lastHitAt, x: a.x - Math.cos(a.lastShotDirection) * 8, y: a.y - Math.sin(a.lastShotDirection) * 8, f: a.floor } : null;
  const miss = ai.nearMiss && now - ai.nearMiss.t < 1 ? ai.nearMiss : null;
  const shot = hit || miss;
  if (shot && shot.t !== tac.shotT) {
    tac.shotT = shot.t;
    tac.shotFrom = { x: shot.x, y: shot.y, f: shot.f };
    tac.shotUntil = now + lerpS(UNDER_FIRE_LOOK, tac.sense);
    const area = fightArea(sim, a, s, tac.sense);
    if (area) {
      chooseSpot(sim, a, tac, tac.shotFrom, area, 'hide');
      tac.holdUntil = tac.shotUntil;
    }
  }
  if (!tac.shotFrom || now > (tac.shotUntil ?? 0)) return null;
  const face = Math.atan2(tac.shotFrom.y - a.y, tac.shotFrom.x - a.x);
  return tac.spot ? atSpot(sim, a, tac, I({ steady: true, crouch: true, face, fire: false })) : I({ steady: true, crouch: true, face, fire: false });
}

// Note: a teammate crosses ground a live threat watches at a run rather than at a crouching walk (item 436).
function tacticalMove(sim, a, intent) {
  if (!intent?.goal || intent.tactical || intent.fire || intent.mode === 'sprint' || a.carrying || a.action) return intent;
  const tac = tacOf(a);
  const threats = a.ai.threats || [];
  if (tac.sense < 0.3 || !threats.some((q) => q.live) || capability(a).mobility < 0.6) return intent;
  const path = pathTo(sim, a, intent.goal);
  if (!path?.length) return intent;
  return routeRisk(sim, path.slice(0, 5), threats) >= RUN_RISK ? { ...intent, mode: 'sprint', crouch: false, lean: 0 } : intent;
}

// Note: the believed threats that are aware and were seen or heard firing lately enough to watch a pushing teammate's way.
function wary(sim, a, tac) {
  const now = sim.time;
  return (a.ai.threats || []).filter((q) => q.f === a.floor && q.aware && q.w >= 0.4 && (q.live || now - q.t < lerpS(PUSH_WARY, tac.sense)));
}

// Note: a push waits in a firing position while a live threat watches its way or its post, as long as the man's patience lasts, then goes on at a run (items 425, 433, 436).
function pushCaution(sim, a, o) {
  const tac = tacOf(a);
  const now = sim.time;
  const watching = tac.sense >= 0.25 ? wary(sim, a, tac) : [];
  a.ai.doing = 'push';
  if (!watching.length) {
    tac.wait = null;
    return null;
  }
  const path = pathTo(sim, a, o.spot);
  const ahead = [...(path || []).slice(0, 8), { x: o.spot.x, y: o.spot.y, f: o.spot.f }];
  const lit = watching.map((q) => ({ ...q, live: true, w: Math.max(q.w, 0.5) }));
  if (routeRisk(sim, ahead, lit) < RUN_RISK) {
    tac.wait = null;
    return null;
  }
  tac.wait ??= { since: now };
  if (now - tac.wait.since > lerpS(PUSH_PATIENCE, tac.sense)) return null;
  a.ai.doing = 'push: wait in cover';
  const hot = watching[0];
  if (needSpot(sim, a, tac, hot.id)) chooseSpot(sim, a, tac, hot, { anchor: a, radius: lerpS(TAC_REACH, tac.sense) });
  // Note: with no cover to wait in he goes on, since standing in the open is no safer than moving.
  if ((tac.spot?.ducked ?? 1) >= 0.5 && !tac.spot?.lean) return dropSpot(tac);
  return atSpot(sim, a, tac, I({ steady: true, crouch: true, face: Math.atan2(hot.y - a.y, hot.x - a.x) }));
}

// Note: a skilled push slices the pie at an open doorway into an uncleared room: from beside it round to the far side, a look through it from each station, before going in (items 433 and 452).
function pieDoor(sim, a, o) {
  const tac = tacOf(a);
  const now = sim.time;
  if (tac.sense < 0.35) return null;
  const spotKey = `${o.spot.f}:${Math.floor(o.spot.x)}:${Math.floor(o.spot.y)}`;
  if (tac.pie && tac.pie.spotKey !== spotKey) tac.pie = null;
  if (!tac.pie) {
    const door = doorwayOn(sim, a, pathTo(sim, a, o.spot), 6);
    if (!door) return null;
    const key = `${door.f}:${Math.floor(door.x)}:${Math.floor(door.y)}`;
    const st = stateAt(sim.map, door.f, Math.floor(door.x), Math.floor(door.y));
    const inside = zoneAt(sim, { x: door.x + door.dir.x, y: door.y + door.dir.y, f: door.f });
    if (tac.pied.has(key) || st === DS.CLOSED || st === DS.LOCKED || inside.open || safe(a.ai.zones, inside)) return null;
    // Note: the pie pays only where an aware man may wait inside, since an unaware one may not be shot first (item 416): a believed hostile in the room, or weapons free.
    if (!a.ai.weaponsFree && !a.ai.mind.threats.some((q) => zoneAt(sim, q).key === inside.key)) return null;
    const count = tac.sense >= 0.75 ? 3 : 2;
    const here = { x: a.x, y: a.y, f: a.floor };
    const through = (x, y, f) => f === door.f && x === Math.floor(door.x) && y === Math.floor(door.y);
    const stations = pieStations(sim, a, door, count).filter((p) => {
      const path = findPath(sim.map, here, p, { windows: false, avoid: through });
      return path && path.length <= 10;
    });
    tac.pied.add(key);
    if (stations.length < 2) return null;
    tac.pie = { key, spotKey, stations, k: 0, at: null };
  }
  const pie = tac.pie;
  a.ai.doing = 'push: pie';
  const st = pie.stations[pie.k];
  if (!st) {
    tac.pie = null;
    return null;
  }
  if (dist(a, st) > 0.35 && a.navState !== 'blocked') return I({ goal: { ...st, r: 0.25, windows: false }, mode: 'walk', crouch: true, quiet: true, face: st.face, steady: true });
  pie.at ??= now;
  if (now - pie.at >= lerpS(PIE_DWELL, tac.sense)) {
    pie.k++;
    pie.at = null;
  }
  return I({ crouch: true, steady: true, face: st.face, quiet: true });
}

// Note: a pushing teammate who spots an unaware hostile covers him from a firing position rather than walking up on him, and goes on when his patience is out (items 93, 416, 425).
function overwatchUnaware(sim, a, t) {
  const ai = a.ai;
  const tac = tacOf(a);
  const now = sim.time;
  if (!ai.order?.accepted || ai.order.kind !== 'push' || tac.sense < 0.35) return null;
  if (tac.watch?.id !== t.id) tac.watch = { id: t.id, since: now };
  if (now - tac.watch.since > lerpS(OVERWATCH_PATIENCE, tac.sense)) return null;
  ai.doing = 'overwatch';
  if (needSpot(sim, a, tac, t.id)) {
    tac.spotFor = t.id;
    // Note: the way to the firing position keeps out of the unaware man's sight, so he is not walked into noticing.
    const unaware = { x: t.x, y: t.y, f: t.floor, w: 1, live: true };
    chooseSpot(sim, a, tac, { x: t.x, y: t.y, f: t.floor, stance: t.stance }, { anchor: a, radius: lerpS(TAC_REACH, tac.sense) * 0.7 }, 'fight', { routeThreats: [unaware, ...(a.ai.threats || [])], pressure: 1 });
  }
  tac.holdUntil = now + lerpS(TAC_HOLD, tac.sense);
  return atSpot(sim, a, tac, I({ steady: true, crouch: true, quiet: true, mode: 'slow', face: Math.atan2(t.y - a.eye.y, t.x - a.eye.x) }), true);
}

// Note: a skilled teammate covers a lawman he sees on the move with quicker shots at a threat that can see that lawman.
function covering(sim, a, t) {
  if (tacOf(a).sense < 0.4) return false;
  return sim.lawmen.some((o) => o !== a && o.status === 'ok' && !o.withdrawn && o.mode !== 'idle' && o.floor === t.floor && sim.sees(a, o) &&
    castRay(sim.map, t.floor, t.x, t.y, o.x, o.y).clear);
}

// Note: a withdrawal crosses a lane a live threat watches only after waiting in cover beside it for a lull, as long as patience lasts (item 436).
function withdrawBound(sim, a, out) {
  const tac = tacOf(a);
  const now = sim.time;
  const live = (a.ai.threats || []).filter((q) => q.live && q.f === a.floor);
  if (tac.sense < 0.25 || !live.length) {
    tac.bound = null;
    return null;
  }
  if (routeRisk(sim, (pathTo(sim, a, out) || []).slice(0, 6), live) < RUN_RISK) return null;
  tac.bound ??= { since: now };
  if (now - tac.bound.since > lerpS(BOUND_PATIENCE, tac.sense)) return null;
  const hot = live[0];
  if (needSpot(sim, a, tac, hot.id)) chooseSpot(sim, a, tac, hot, { anchor: a, radius: 5, ok: (p) => dist(p, out) <= dist(a, out) + 3 }, 'hide');
  if ((tac.spot?.ducked ?? 1) >= 0.5) return dropSpot(tac);
  return atSpot(sim, a, tac, I({ crouch: true, face: Math.atan2(hot.y - a.y, hot.x - a.x), fire: false }));
}

function thinkDeputy(sim, a) {
  const realSheriff = sim.sheriff;
  const estimate = sheriffEstimate(sim, a);
  const s = sim.sees(a, realSheriff) ? realSheriff : estimate;
  const ai = a.ai;
  const now = sim.time;
  if (s.status !== 'ok' && !ai.calledSheriffDown && s === realSheriff) {
    ai.calledSheriffDown = true;
    sim.say(a, 'Sheriff down!', 'shout', { sheriffDown: true });
  }
  // Note: a sheriff seen down, or reported down by a teammate, ends every standing order (item 479).
  if (!ai.autonomous && (estimate.status === 'incapacitated' || estimate.status === 'dead' || ai.toldSheriffDown)) {
    ai.autonomous = true;
    ai.order = null;
    ai.prevOrder = null;
    releaseHold(ai);
  }
  a.alert = true;
  const cap = capability(a);
  const sight = visible(sim, a);
  const seen = deputyNotices(sim, a, sight) ? sight : [];
  const mind = a.ai.mind;
  for (const h of freshSounds(sim, a)) {
    if (h.srcRole === 'hostile') {
      ai.noise = { x: h.pos.x, y: h.pos.y, f: h.floor, t: now };
      observeThreat(mind, { x: h.pos.x, y: h.pos.y, f: h.floor, t: now, src: 'heard', conf: 0.5, coarse: 2, ...(GUNFIRE.has(h.kind) ? { shotAt: now } : {}) });
      disprove(mind, h.floor, h.pos.x, h.pos.y, 2.5);
    }
    if (GUNFIRE.has(h.kind) && h.srcRole === 'hostile') ai.lastHostileGun = now;
    if (h.srcRole === 'hostile' && (GUNFIRE.has(h.kind) || h.kind === 'shout')) ai.hostileAlarmAt = now;
    if (GUNFIRE.has(h.kind) && (h.srcRole === 'sheriff' || h.srcRole === 'deputy')) {
      // Note: the join delay runs from a volley's first lawman shot.
      if (now - (ai.sheriffShotAt ?? -99) > ROE_MEMORY) ai.joinAt = now + JOIN_DELAY[0] + (JOIN_DELAY[1] - JOIN_DELAY[0]) * sim.rand();
      ai.sheriffShotAt = now;
    }
  }
  updateMind(sim, a, seen);
  const foes = weaponsFree(sim, a, seen);
  ai.threats = threatPicture(sim, a);
  const left = estimatedEnemies(a);
  const threat = assessThreat(sim, a, s, seen);
  if (threat.recent) ai.threatAt = now;
  if (ai.order?.fresh) receiveOrder(sim, a, seen);

  if (a.carrying) {
    if (s.status === 'dead') sim.releaseCarry(a);
  }
  if ((a.carrying || a.action?.type === 'pickup') && threat.contact.length) abortCarry(sim, a, 'contact');
  else if (ai.fleeing === 'carry' && !a.carrying && threat.recent) {
    // Note: a lift that has not happened yet is called off the moment danger shows.
    ai.fleeing = null;
    ai.assessUntil = null;
    if (a.action?.type === 'pickup') a.action = null;
  }
  if (!a.carrying && a.action?.type !== 'pickup') {
    const missMove = nearMissMove(sim, a);
    if (missMove) return missMove;
  }
  // Note: in a fight a teammate still gives way, but keeps his stance and his gun up while he does (item 418).
  const fighting = foes.length > 0 || threat.recent;
  const yielding = yieldToSheriff(sim, a, s, fighting) || steerAround(sim, a);
  if (yielding) return fighting ? { ...yielding, crouch: a.stance === 'crouch', fire: undefined } : yielding;
  if (now >= (ai.nextDecide ?? 0)) {
    ai.nextDecide = now + 0.4;
    if (!ai.fleeing || (ai.fleeing === 'carry' && !a.carrying && !a.action && s.status === 'dead')) ai.fleeing = decideFlee(sim, a, { s, cap, left, threat });
  }
  if (ai.fleeing) {
    ai.doing = ai.fleeing;
    return deputyFlee(sim, a, s);
  }
  const retreating = ai.order?.kind === 'fallback' && ai.order.accepted && ai.order.arrivedAt == null;
  if (ai.order?.kind === 'fallback' && ai.order.accepted) {
    const retreat = deputyOrder(sim, a);
    ai.doing = 'fall back';
    if (retreat && !seen.length) return tacticalMove(sim, a, watchedIntent(sim, a, a.ai.approach, retreat));
  }
  if (seen.length) {
    if (foes.length) {
      if (ai.weaponsFree && now - (ai.contactCallAt ?? -99) > 12) {
        sim.say(a, 'Contact!', 'shout');
        ai.contactCallAt = now;
      }
      const intent = deputyEngage(sim, a, s, foes);
      // Note: a firing position chosen inside the order's own ground stands; otherwise the order's post or a push's firing step does.
      const ordered = intent.tactical ? null : deputyOrder(sim, a);
      ai.doing = 'fight';
      // Note: a push in contact keeps its own firing step instead of returning to its post between sightings.
      const pushFighting = ai.order?.kind === 'push' && (now < (ai.fightUntil ?? 0) || (!!pushContact(a) && !!(intent.goal || intent.move)));
      if (ordered?.goal && !pushFighting) { intent.goal = ordered.goal; intent.move = null; }
      return glanceInFight(sim, a, s, intent, sim.byId(intent.targetId));
    }
    ai.doing = 'watch';
    return tacticalMove(sim, a, deputyObserve(sim, a, s, seen, left, threat));
  }
  if (!retreating) {
    const fired = underFire(sim, a, s);
    ai.doing = 'fired on';
    if (fired) return fired;
    const held = tacticalHold(sim, a, s);
    ai.doing = 'hold fire position';
    if (held) return turnToNoise(sim, a, held);
  }
  ai.doing = ai.order?.accepted ? ai.order.kind : 'cover';
  return turnToNoise(sim, a, tacticalMove(sim, a, deputyCalm(sim, a, s, left, threat, false)));
}

function deputyCalm(sim, a, s, left, threat, watching) {
  // Note: on his own judgment he guards a downed sheriff while danger is near, else pushes on without a bound (item 479).
  if (a.ai.autonomous) {
    if (s.status === 'incapacitated' && left > 0) {
      const down = deputyDown(sim, a, s, threat);
      if (down) return down;
    }
    a.ai.order ??= { kind: 'push', accepted: true, own: true, t: sim.time };
  }
  // Note: a quiet spell is used to top up the guns.
  const lull = (intent) => {
    if (!watching && !threat.active) topUp(a, intent);
    return intent;
  };
  const estimate = sheriffEstimate(sim, a);
  const order = deputyOrder(sim, a);
  // Note: Cover keeps the sheriff in view between looks at watched positions, so his hand signals are seen.
  if (order) {
    const out = watchedIntent(sim, a, a.ai.approach, order);
    return lull(a.ai.order.kind === 'cover' ? watchSheriff(sim, a, estimate, out) : out);
  }
  if (!watching && !threat.active && a.floor === s.floor && dist(a, s) <= 6) {
    const loot = scavengeIntent(sim, a);
    if (loot) return loot;
  }
  return lull(watchSheriff(sim, a, estimate, watchedIntent(sim, a, 'hold', deputyFollow(sim, a, estimate)), watching ? 1.5 : 1));
}

function holdAndSecure(sim, a) {
  a.ai.approach = 'hold';
  const spot = orderPost(sim, a, 'hold');
  return I({ ...(spot && dist(a, spot) > 0.8 ? { goal: { ...spot, r: 0.4, windows: true } } : {}), crouch: true, steady: true, face: spot?.arc ?? a.facing });
}

// Note: weapons free comes from perceived fighting and never makes an unaware hostile a target.
function weaponsFree(sim, a, all) {
  const ai = a.ai;
  const now = sim.time;
  // Note: a broken hostile without a gun is no threat while the break lasts.
  const seen = all.filter((h) => (h.broken ?? 0) <= now || !!weaponOf(h));
  const friendHit = now - (ai.friendHitAt ?? -99) < ROE_MEMORY;
  const loud = recentlyHit(a, now, ROE_MEMORY) || friendHit
    || now - (ai.lastHostileGun ?? -99) < ROE_MEMORY || now - (ai.hostileAlarmAt ?? -99) < ROE_MEMORY
    || (now - (ai.sheriffShotAt ?? -99) < ROE_MEMORY && now >= (ai.joinAt ?? 0));
  // Note: the raised weapon is what anyone sees of a hostile that has noticed the lawmen, the same state the view draws.
  const braced = (h) => h.ai.state === 'engage';
  // Note: a hostile seen braced, firing or hit is remembered as one who knows of the lawmen.
  const foes = (ai.foes ||= new Set());
  for (const h of seen) if (braced(h) || now - (h.lastFiredAt ?? -99) < ROE_MEMORY || recentlyHit(h, now, ROE_MEMORY)) foes.add(h.id);
  const aware = (h) => foes.has(h.id);
  // Note: a known foe in view is an immediate hostile sign, so weapons free outlasts a lull in his fire.
  const ongoing = ai.weaponsFree && (seen.some(aware) || now - (ai.lastHostileGun ?? -99) < ROE_MEMORY);
  const fighting = recentlyHit(a, now, ROE_MEMORY) || friendHit || now - (ai.sheriffShotAt ?? -99) < ROE_MEMORY ||
    now - (ai.lastHostileGun ?? -99) < ROE_MEMORY || now - (a.lastFiredAt ?? -99) < ROE_MEMORY;
  ai.weaponsFree = ongoing || fighting;
  if (loud || (ongoing && now >= (ai.joinAt ?? 0))) return seen.filter(aware).sort((p, q) => Number(braced(q)) - Number(braced(p)));
  return seen.filter(braced);
}

// Note: an unaware hostile in view is watched low and quiet without firing, while the current task goes on.
function deputyObserve(sim, a, s, seen, left, threat) {
  const ai = a.ai;
  const now = sim.time;
  const t = seen[0];
  const base = overwatchUnaware(sim, a, t) || deputyCalm(sim, a, s, left, threat, true);
  const intent = { ...base, fire: false, crouch: true, quiet: true, steady: true, mode: base.mode === 'sprint' ? 'sprint' : 'slow' };
  // Note: the eyes stay on the hostile except during a glance at the sheriff.
  if (now >= (ai.glanceUntil ?? 0)) intent.face = Math.atan2(t.y - a.eye.y, t.x - a.eye.x);
  armWeapon(a, intent, dist(a, t), aimsAt(t, a));
  pointOut(sim, a, s, t);
  challenge(sim, a, t);
  return intent;
}

// Note: items 416 and 479: with the sheriff known down nobody else will open the fight, so a teammate in view of an unaware hostile calls him out; the shout alarms him (item 403) and the first shot is still never the teammate's.
function challenge(sim, a, t) {
  const ai = a.ai;
  if (!ai.autonomous || dist(a, t) > CHALLENGE_RANGE || sim.time - (ai.challengedAt ?? -99) < CHALLENGE_EVERY) return;
  ai.challengedAt = sim.time;
  sim.say(a, 'Law! Drop that gun!', 'shout');
}

// Note: a silent hand signal, given only when the sheriff watches the deputy and cannot see the hostile.
function pointOut(sim, a, s, t) {
  const ai = a.ai;
  const now = sim.time;
  ai.pointed = ai.pointed || {};
  if (now - (ai.pointed[t.id] ?? -99) < POINT_EVERY) return;
  if (!sim.sees(s, a) || sim.pointVisible(s, t.x, t.y)) return;
  ai.pointed[t.id] = now;
  sim.events.push({ type: 'signal', actorId: a.id, kind: 'hostile' });
}

// Note: an alert lawman still needs time to notice a hostile, starting over after losing track.
function deputyNotices(sim, a, sight) {
  const ai = a.ai;
  const now = sim.time;
  if (ai.aware && !sight.length && ai.lostSightAt == null) ai.lostSightAt = now;
  if (ai.aware && ai.lostSightAt != null && now - ai.lostSightAt > LOST_TRACK) {
    ai.aware = false;
    ai.lastEngaged = ai.engaged;
    ai.engaged = null;
  }
  if (sight.length && ai.aware) {
    ai.sightAt = now;
    ai.lostSightAt = null;
    return true;
  }
  if (sight.length) ai.lostSightAt = null;
  // Note: a deputy who has just seen a hostile is braced and notices the next one sooner.
  const wary = alertNow(a.ai.mind, now) >= 0.35;
  if (!noticing(sim, a, sight, wary)) return false;
  ai.aware = true;
  startle(sim, a, 60, wary);
  startChain(sim, a, wary, sight[0]);
  return true;
}

// Note: the threat a lawman weighs from what he sees, last saw, heard and was shot by.
function assessThreat(sim, a, s, seen) {
  const ai = a.ai;
  const now = sim.time;
  const contact = seen.filter((h) => h.ai.state === 'engage' || dist(a, h) < CONTACT_RANGE);
  let reason = seen.length ? 'seen' : null;
  let pos = seen.length ? { x: seen[0].x, y: seen[0].y, f: seen[0].floor } : null;
  if (!reason) {
    for (const [id, k] of Object.entries(a.known)) {
      if (!a.ai.mind.threats.some((p) => p.id === Number(id)) || k.f !== s.floor || dist(k, s) > 10) continue;
      if (!castRay(sim.map, k.f, k.x, k.y, s.x, s.y).clear) continue;
      reason = 'known';
      pos = { x: k.x, y: k.y, f: k.f, t: k.t };
      break;
    }
  }
  const noisy = ai.noise && a.ai.mind.threats.some((p) => p.f === ai.noise.f && dist(p, ai.noise) < 0.8) && ai.noise.f === s.floor && dist(ai.noise, s) < 10;
  if (!reason && noisy) {
    reason = 'noise';
    pos = { x: ai.noise.x, y: ai.noise.y, f: ai.noise.f };
  }
  if (!reason && now - (ai.lastHostileGun ?? -99) < SHOT_MEMORY) reason = 'shots';
  if (!reason && recentlyHit(a, now, SHOT_MEMORY)) reason = 'hit';
  if (!pos && reason && ai.noise) pos = { x: ai.noise.x, y: ai.noise.y, f: ai.noise.f };
  // Note: a remembered position stays a threat, but only a hostile seen, shooting or heard lately breaks a quiet spell.
  const heardAt = reason === 'known' ? pos.t : reason === 'noise' ? ai.noise.t : now;
  const recent = !!reason && now - heardAt < SHOT_MEMORY;
  return { active: !!reason, recent, reason, contact, pos };
}

// Note: the way out must not run past anyone last seen or heard near it.
function routeSafe(sim, a, s) {
  const out = { ...safeSpot(sim, a), f: 0 };
  const path = findPath(sim.map, { x: s.x, y: s.y, f: s.floor }, out);
  if (!path) return false;
  const danger = Object.entries(a.known)
    .filter(([id]) => a.ai.mind.threats.some((p) => p.id === Number(id)))
    .map(([, k]) => k);
  danger.push(...(a.ai.mind.threats));
  const mind = a.ai.mind;
  // Note: ground the deputy has looked over since the danger was there is safer than it was.
  const rechecked = (q) => clearStamp(mind, q.f, Math.floor(q.x), Math.floor(q.y)) > q.t + 1;
  const live = danger.filter((q) => !rechecked(q));
  return !path.some((p) => live.some((q) => q.f === p.f && Math.hypot(q.x - p.x, q.y - p.y) < 4));
}

function rescueReady(sim, a, s, threat) {
  const ai = a.ai;
  const now = sim.time;
  if (threat.recent || now - (ai.threatAt ?? -99) < QUIET_NEEDED) return false;
  if (now >= (ai.routeAt ?? 0)) {
    ai.routeAt = now + 2;
    ai.routeOk = routeSafe(sim, a, s);
  }
  return !!ai.routeOk;
}

// Note: contact while lifting or carrying puts the sheriff down where the deputy stands.
function abortCarry(sim, a, why) {
  const ai = a.ai;
  if (a.action?.type === 'pickup') a.action = null;
  if (a.carrying) sim.releaseCarry(a, why);
  ai.fleeing = null;
  ai.assessUntil = null;
  ai.carryCooldown = sim.time + CARRY_COOLDOWN;
  ai.threatAt = sim.time;
  sim.say(a, 'Contact!', 'shout');
  ai.contactCallAt = sim.time;
}

function releaseHold(ai) {
  ai.holdSpot = null;
  if (ai.state === 'holding') ai.state = 'idle';
}

// Note: an order's post on the deputy's own zone map, chosen round himself for Hold and round the sheriff otherwise.
const orderPost = (sim, a, kind) => chooseZonePost(sim, a, kind, kind === 'hold' ? a : sheriffEstimate(sim, a));

// Note: a spot is taken by a known lawman standing on it, or, when only senior teammates count, by a senior one.
function taken(sim, a, x, y, anyone = false) {
  const senior = new Set(elders(sim, a).map((o) => o.id));
  return knownLawmen(a).some((p) => (anyone || senior.has(p.id)) && !p.passive && p.f === a.floor && Math.hypot(p.x - x, p.y - y) < BODY_WIDTH);
}

// Note: the deputy's sight records hostiles as threats, forgets the dead and looks the place over.
function updateMind(sim, a, seen) {
  const mind = a.ai.mind;
  const now = sim.time;
  for (const h of seen) {
    observeThreat(mind, { id: h.id, x: h.x, y: h.y, f: h.floor, t: now, src: 'saw', conf: 1 });
    disprove(mind, h.floor, h.x, h.y, 1.5);
    setAlert(mind, 1, now);
  }
  for (const th of mind.threats) {
    const actor = th.id == null ? null : sim.byId(th.id);
    if (actor && actor.status !== 'ok' && sim.sees(a, actor)) dropThreat(mind, th.id);
  }
  lookOver(sim, a);
}

function receiveOrder(sim, a, seen) {
  const ai = a.ai;
  const o = ai.order;
  const prev = ai.prevOrder;
  const now = sim.time;
  o.fresh = false;
  // Note: a hand signal is answered by hand and a spoken order by a whisper.
  const hand = o.method === 'signal';
  // Note: what was in force before this call stays in force when the call is turned down.
  const before = () => (prev?.accepted ? prev : null);
  const refuse = (line) => {
    ai.order = before();
    if (hand) sim.events.push({ type: 'signal', actorId: a.id, kind: 'refuse', ack: 'no' });
    else sim.say(a, line, 'whisper');
  };
  const answer = () => {
    if (hand) sim.events.push({ type: 'signal', actorId: a.id, kind: o.kind, ack: 'yes' });
    else sim.say(a, ACK_LINE[o.kind], 'whisper');
  };
  const p = 0.92 - (seen.length ? 0.4 : 0) - (a.carrying ? 1 : 0) - (a.deathAt != null ? 0.2 : 0);
  if (sim.rand() >= p) return refuse('Not now.');
  const spot = orderPost(sim, a, o.kind);
  // Note: only Fall back is turned down for want of a post, since the other orders hold and secure until one appears.
  if (!spot && o.kind === 'fallback') return refuse("Can't get there.");
  if (o.kind !== 'hold') o.spot = spot;
  // Note: a push's trail starts in the zone it was given in.
  if (o.kind === 'push') o.trail = [zoneAt(sim, a).key];
  if (o.kind === 'fallback') o.threat = { x: spot.x + Math.cos(spot.arc) * 5, y: spot.y + Math.sin(spot.arc) * 5, f: spot.f };
  o.accepted = true;
  if (o.kind === 'hold') {
    ai.holdSpot = spot;
    ai.state = 'holding';
  } else releaseHold(ai);
  answer();
}

// Note: another deputy is seen carrying or lifting the sheriff, or a senior one is seen kneeling beside him.
function carrySeen(sim, a, s) {
  const senior = elders(sim, a);
  return sim.deputies.some((o) => o !== a && o.status === 'ok' && sim.sees(a, o) &&
    (o.carrying === s.id || (o.action?.type === 'pickup' && o.action.id === s.id) || (senior.includes(o) && o.floor === s.floor && dist(o, s) < 1.4)));
}

// Note: carry or retreat, weighing the sheriff's condition, the deputy's own state and hostile fire.
function decideFlee(sim, a, { s, cap, left, threat }) {
  const now = sim.time;
  const ai = a.ai;
  if (left === 0) return null;
  const dying = a.deathAt != null && a.deathAt - now < 60;
  const hurt = dying || cap.mobility < 0.5 || (!cap.rifleOk && !cap.handgunOk);
  const dry = !canReady(a);
  if (left > 1 && s.status !== 'unknown' && s.status !== 'dead' && fitToCarry(cap) && !hurt && (ai.carryCooldown || 0) < now && dist(a, s) < 30) {
    const sc = capability(s);
    // Note: a sheriff within 30 s of dying, or unable to move well or shoot, is worth carrying out.
    const failing = s.status !== 'ok' || (s.deathAt != null && s.deathAt - now < 30);
    const crippled = sc.mobility < 0.5 || (!sc.rifleOk && !sc.handgunOk);
    if ((failing || crippled) && !s.carried && !carrySeen(sim, a, s) && rescueReady(sim, a, s, threat)) return 'carry';
  }
  // Note: under fire means hostile fire or a hit, not the lawmen's own guns.
  const underFire = now - (ai.lastHostileGun ?? -99) < UNDER_FIRE || recentlyHit(a, now, UNDER_FIRE);
  const resolve = a.traits.nerve + (a.loyalty - BASE_LOYALTY) / 250;
  if (!walks(cap)) return null;
  if ((hurt || dry) && underFire && resolve < 0.85) return 'retreat';
  const allies = 1 + knownLawmen(a).filter((l) => !l.passive).length;
  if (s.status === 'dead' && left > allies && resolve < 0.6) return 'retreat';
  return null;
}

function deputyFlee(sim, a, s) {
  const ai = a.ai;
  ai.approach = 'fallback';
  const now = sim.time;
  const out = { ...safeSpot(sim, a), f: 0, r: 0.15 };
  if (ai.fleeing === 'carry' && !a.carrying) {
    // Note: when another deputy is seen with the sheriff, this one goes back to the fight.
    if (s.status === 'dead' || (ai.carryCooldown || 0) > now || s.carried || carrySeen(sim, a, s)) {
      ai.fleeing = null;
      return I();
    }
    const toward = Math.atan2(s.y - a.y, s.x - a.x);
    if (a.action?.type === 'pickup') return I({ face: toward });
    if (dist(a, s) < 1.3 && a.floor === s.floor) {
      // Note: a look around before the lift, starting with the room behind the sheriff.
      const held = sim.fovOf(a).zones.length > 1;
      const span = held ? ASSESS_HOLD * ASSESS_TURNS.length : ASSESS_TIME;
      if (ai.assessUntil == null) ai.assessUntil = now + span;
      if (now < ai.assessUntil) {
        // Note: the single cone of the classic preset sweeps on a fixed sine.
        const swing = held ? ASSESS_TURNS[Math.max(0, Math.min(ASSESS_TURNS.length - 1, Math.floor((now - ai.assessUntil + span) / ASSESS_HOLD)))] : Math.sin((now - ai.assessUntil + ASSESS_TIME) * 2.4) * 1.8;
        return I({ face: toward + Math.PI + swing });
      }
      ai.assessUntil = null;
      // Note: another lift already under way, felt but not seen, leaves this deputy to the fight.
      if (!sim.startCarry(a, s)) {
        ai.fleeing = null;
        ai.carryCooldown = now + CARRY_COOLDOWN;
        return I();
      }
      sim.say(a, 'Clear. I have you.', 'whisper');
      ai.announced = true;
      return I({ face: toward });
    }
    ai.assessUntil = null;
    const urgent = s.deathAt != null && s.deathAt - now < 30;
    return I({ goal: { x: s.x, y: s.y, f: s.floor, r: 1 }, mode: urgent ? 'sprint' : 'walk' });
  }
  if (!a.carrying) {
    const bound = withdrawBound(sim, a, out);
    if (bound) return bound;
  }
  return watchedIntent(sim, a, 'fallback', I({ goal: { ...out, windows: !a.carrying }, mode: a.carrying ? 'walk' : 'sprint' }));
}

// Note: the nearest extraction edge the fewest believed hostiles watch and no route runs past, else where he stands.
function safeSpot(sim, a) {
  const points = [];
  const { W, H } = sim.map;
  for (let x = 1; x < W - 1; x++) points.push({ x: x + 0.5, y: 1.5, f: 0 }, { x: x + 0.5, y: H - 1.5, f: 0 });
  for (let y = 2; y < H - 2; y++) points.push({ x: 1.5, y: y + 0.5, f: 0 }, { x: W - 1.5, y: y + 0.5, f: 0 });
  const threats = a.ai.mind.threats;
  const risk = (p) => threats.filter((t) => t.f === p.f && castRay(sim.map, p.f, t.x, t.y, p.x, p.y).clear).length;
  points.sort((p, q) => risk(p) - risk(q) || dist(a, p) - dist(a, q));
  // Note: a route is suicidal when it runs close past a believed hostile he is not already close to.
  const ahead = threats.filter((t) => t.f !== a.floor || dist(a, t) >= SUICIDE_RANGE);
  const suicidal = (path) => path.some((p) => ahead.some((t) => t.f === p.f && Math.hypot(t.x - p.x, t.y - p.y) < SUICIDE_RANGE));
  let tried = 0;
  for (const p of points) {
    if (!goalAvailable(sim, a, p) || solidAt(sim.map, 0, Math.floor(p.x), Math.floor(p.y))) continue;
    const path = findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, p, { windows: !a.carrying });
    if (path && !suicidal(path)) return p;
    if (path && ++tried >= EXIT_TRIES) break;
  }
  return { x: a.x, y: a.y, f: a.floor };
}

// Note: the most immediate perceived threat with a usable shot wins, with a bonus for the current target.
function pickTarget(sim, a, seen, allies) {
  // Note: a deputy leaves to the sheriff or a senior teammate he sees the target that one is facing, so the fire is split.
  const ahead = a.role === 'deputy' && seen.length > 1 ? [sim.sheriff, ...elders(sim, a)].filter((o) => o.status === 'ok' && !o.passive && !o.withdrawn && sim.sees(a, o)) : [];
  const theirs = (t) => ahead.some((o) => o.floor === t.floor && Math.abs(angleDiff(o.facing, Math.atan2(t.y - o.y, t.x - o.x))) < SPLIT_ARC);
  const score = (t) => (dist(a, t) < IMMINENT_RANGE ? 8 : 0)
    + (t.ai.state === 'engage' ? 3 : 0)
    + (allyInLine(a, t, allies) ? 0 : 2.5)
    + (a.ai.engaged === t.id ? 1.5 : 0) - dist(a, t) * 0.06
    - (theirs(t) ? 2.5 : 0);
  const ranked = [...seen].sort((p, q) => score(q) - score(p));
  return ranked.find((t) => !lineBlocked(a, t, allies) && sim.exposedAim(a, t, false)) || ranked[0];
}

// Note: a short reachable step to a clear shot, kept rather than chosen afresh every thought.
function fireStep(sim, a, t, allies) {
  const ai = a.ai;
  if (!weaponOf(a) || a.elev || isFlight(tileAt(sim.map, a.floor, Math.floor(a.x), Math.floor(a.y)))) return null;
  const o = ai.order;
  const zoned = o?.kind === 'push' || o?.kind === 'fallback';
  const post = o?.kind === 'hold' ? ai.holdSpot : o?.kind === 'cover' ? o.spot : zoned && o.accepted && o.arrivedAt != null ? o.spot : null;
  // Note: a step from a push or retreat post stays inside the post's zone.
  const withinPost = (p) => !post || (p.f === post.f && dist(p, post) <= POST_TETHER && (!zoned || sameZone(sim, p, post)));
  const clear = (p) => {
    if (!withinPost(p) || allies.some(c => c && c.floor === p.f && c.status !== 'dead' && dist(c, p) < 0.7)) return false;
    const probe = { ...a, x: p.x, y: p.y, eye: { x: p.x, y: p.y }, lean: 0,
      stance: dist(a, t) > 3.5 ? 'crouch' : a.stance, facing: Math.atan2(t.y - p.y, t.x - p.x) };
    if (allyInLine(probe, t, allies) || !sim.sees(probe, t)) return false;
    return t.floor !== a.floor || t.elev ? !!sim.exposedAim(probe, t, false)
      : clearShotToActor(sim.map, sim.shaft, probe, t, { x: t.x, y: t.y, z: sim.aimHeight(t, false) });
  };
  const old = ai.fireStep;
  if (old && old.targetId === t.id && sim.time < old.until && a.navState !== 'blocked' && clear(old)) return old;
  ai.fireStep = null;
  if (sim.time < (ai.fireStepAt ?? 0)) return null;
  ai.fireStepAt = sim.time + 0.5;
  const spots = [];
  const cx = Math.floor(a.x), cy = Math.floor(a.y);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    const p = { x: x + 0.5, y: y + 0.5, f: a.floor };
    const distance = dist(a, p);
    if (distance < 0.5 || distance > 2.5 || solidAt(sim.map, a.floor, x, y) || choke(sim, a.floor, x, y) || !withinPost(p)) continue;
    spots.push({ ...p, distance });
  }
  spots.sort((p, q) => p.distance - q.distance);
  for (const p of spots) {
    if (!clear(p)) continue;
    const path = findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, p, {
      windows: false, avoid: (x, y, f) => sim.occupied(x, y, f, a),
    });
    if (!path || path.length > 5 || path.some(q => q.f !== a.floor || q.kind !== 'walk' || !withinPost(q))) continue;
    if ((ai.futileSteps = (ai.futileSteps || 0) + 1) > FUTILE_STEPS) {
      ai.futileSteps = 0;
      ai.fireStepAt = sim.time + FUTILE_PAUSE;
      return null;
    }
    ai.fireStep = { x: p.x, y: p.y, f: p.f, targetId: t.id, until: sim.time + 2 };
    ai.fightUntil = sim.time + FIGHT_STICK;
    return ai.fireStep;
  }
  return null;
}

function deputyEngage(sim, a, s, seen) {
  const ai = a.ai;
  const now = sim.time;
  const allies = knownAllies(sim, a, [sim.sheriff, sim.civilian, ...sim.deputies]);
  const t = pickTarget(sim, a, seen, allies);
  const d = dist(a, t);
  if (ai.engaged !== t.id) {
    if (ai.engaged != null) retarget(sim, a);
    ai.engaged = t.id;
    ai.searchFrom = null;
  }
  // Note: under an accepted order he fights from his post rather than chase or seek cover by a fallen sheriff.
  // Note: his own push on his own judgment does not tie him to a post.
  const holding = ai.state === 'holding' || (!!ai.order?.accepted && !ai.order.own);
  ai.foughtAt = now;
  const intent = I({ targetId: t.id, mode: 'walk', crouch: d > 3.5, steady: d > 5 && a.mode === 'idle' && now >= (ai.steadyFrom ?? 0) });
  intent.aimHigh = headAim(a, intent);
  const armed = armWeapon(a, intent, d, aimsAt(t, a));
  // Note: covering a lawman on the move he takes the quicker, rougher shot.
  const cover = covering(sim, a, t);
  intent.fire = fireReady(sim, a, t, intent, armed, d < 6 || a.settle > 0.45 || recentlyHit(a, now) || (cover && a.settle > 0.2), allies);
  // Note: a skilled man stays longer where he fought from before he moves on (item 433).
  if (intent.fire) { ai.futileSteps = 0; ai.fightUntil = now + FIGHT_STICK * (0.7 + 0.8 * tacOf(a).sense); }
  intent.guard = allies;
  if (allyInLine(a, t, allies) || !sim.exposedAim(a, t, intent.aimHigh)) {
    const p = fireStep(sim, a, t, allies);
    if (p) {
      const gap = dist(a, p);
      // Note: navigation stops at the tile edge, so the step inside the tile is walked directly.
      if (Math.floor(a.x) === Math.floor(p.x) && Math.floor(a.y) === Math.floor(p.y) && gap > 0.1) {
        intent.move = { x: (p.x - a.x) / gap, y: (p.y - a.y) / gap };
      } else intent.goal = { x: p.x, y: p.y, f: p.f, r: 0.3, windows: false };
    }
  } else {
    ai.fireStep = null;
    // Note: a held post is not given up to chase.
    if (!holding && s.status === 'incapacitated' && d > 4) deputyCoverStep(sim, a, s, t, intent);
    else if (!holding && s.status !== 'ok' && d > 9) intent.goal = { x: t.x, y: t.y, f: t.floor, r: 8 };
  }
  // Note: guarding a downed sheriff keeps its own cover beside him.
  if (intent.goal && !holding && s.status === 'incapacitated') return intent;
  return tacticalEngage(sim, a, s, t, intent);
}

// Note: with the sheriff down the deputy takes cover near him and holds fire on the way.
function deputyCoverStep(sim, a, s, t, intent) {
  const ai = a.ai;
  const now = sim.time;
  if (now > (ai.downCoverUntil ?? 0)) {
    ai.downCover = coverFrom(sim, a, t, 5, s);
    ai.downCoverUntil = now + 2.5;
  }
  if (!ai.downCover || dist(a, ai.downCover) < 0.6) return;
  coverCall(sim, a);
  intent.goal = { ...ai.downCover, r: 0.5 };
  intent.mode = 'sprint';
  intent.crouch = true;
  if (dist(a, ai.downCover) > 1.2) intent.fire = false;
}

function coverCall(sim, a) {
  if (sim.time - (a.ai.calledAt ?? -99) < 20) return;
  a.ai.calledAt = sim.time;
  sim.say(a, 'Sheriff down! Covering!', 'shout', { sheriffDown: true });
}

// Note: guard a downed sheriff from cover while danger remains nearby.
function deputyDown(sim, a, s, threat) {
  const ai = a.ai;
  const now = sim.time;
  if (!threat.active) return null;
  // Note: no shout here, since it would draw an unseen threat onto the deputy.
  const from = threat.pos;
  if (from && now > (ai.guardUntil ?? 0)) {
    ai.guard = coverFrom(sim, a, from, 5, s);
    ai.guardUntil = now + 1.5;
  }
  const spot = from ? ai.guard : null;
  if (spot && dist(a, spot) > 0.7) return I({ goal: { ...spot, r: 0.5 }, mode: 'walk', crouch: true });
  return I({ crouch: true, steady: true, face: from ? Math.atan2(from.y - a.y, from.x - a.x) : a.facing });
}

function deputyOrder(sim, a) {
  const ai = a.ai;
  const o = ai.order;
  if (!o) return null;
  if (!o.accepted) return null;
  a.ai.approach = o.kind === 'push' ? 'push' : o.kind === 'fallback' ? 'fallback' : 'hold';
  if (o.kind === 'cover') {
    const s = sheriffEstimate(sim, a);
    if (sim.time >= (o.repostAt ?? 0)) {
      o.spot = orderPost(sim, a, 'cover');
      o.repostAt = sim.time + REPOST_EVERY;
    }
    // Note: with no covering post near the sheriff he follows him, which is movement within Cover.
    if (!o.spot || o.spot.f !== s.floor || dist(o.spot, s) > COVER_REACH || sim.time - s.t > LOST_CONTACT) {
      o.spot = null;
      return deputyFollow(sim, a, s);
    }
    return deputyHoldArea(sim, a, o);
  }
  if (o.kind === 'hold') {
    // Note: a post a senior teammate is seen standing on is given up for another.
    if (!ai.holdSpot || taken(sim, a, ai.holdSpot.x, ai.holdSpot.y)) ai.holdSpot = orderPost(sim, a, 'hold');
    return deputyHoldArea(sim, a, o);
  }
  return deputyMoveOrder(sim, a, o);
}

// Note: whether a teammate may move now: a teammate he sees stands covering, he is the senior of those he sees, he sees none, or he has waited long enough; only what he sees counts (item 414).
export function overwatched(sim, a) {
  const ai = a.ai;
  const now = sim.time;
  if (now < (ai.boundGoUntil ?? 0)) return true;
  const mates = sim.deputies.filter((d) => d !== a && d.status === 'ok' && !d.passive && !d.withdrawn && !d.carrying && sim.sees(a, d));
  const elder = elders(sim, a);
  const free = !mates.length || mates.some((d) => d.mode === 'idle') || !mates.some((d) => elder.includes(d));
  if (free) {
    ai.boundWaitFrom = null;
    return true;
  }
  ai.boundWaitFrom ??= now;
  if (now - ai.boundWaitFrom < BOUND_WAIT) return false;
  // Note: a teammate who never stops is not waited on for ever; he goes for a spell, then judges again.
  ai.boundWaitFrom = null;
  ai.boundGoUntil = now + BOUND_GO;
  return true;
}

// Note: Push advances and sweeps successive zones, and Fall Back keeps its retreat post.
function deputyMoveOrder(sim, a, o) {
  if (!o.spot && sim.time >= (o.repostAt ?? 0)) {
    o.spot = orderPost(sim, a, o.kind);
    o.repostAt = sim.time + REPOST_EVERY;
  }
  if (!o.spot) return holdAndSecure(sim, a);
  const d = a.floor === o.spot.f ? dist(a, o.spot) : Infinity;
  const atPost = d <= ARRIVED || (o.arrivedAt != null && a.floor === o.spot.f && d <= POST_TETHER && sameZone(sim, a, o.spot)) || (a.navState === 'arrived' && sameZone(sim, a, o.spot));
  if (!atPost) {
    if (o.kind === 'push') {
      const careful = pushCaution(sim, a, o) || pieDoor(sim, a, o);
      if (careful) return careful;
    }
    const face = o.kind === 'fallback' ? Math.atan2(o.threat.y - a.y, o.threat.x - a.x) : Math.atan2(o.spot.y - a.y, o.spot.x - a.x);
    // Note: bounding: while no teammate he sees is covering, he covers from where he stands instead of moving too.
    if (!overwatched(sim, a)) return I({ crouch: true, steady: true, face });
    return I({ goal: { ...o.spot, r: 0.35, windows: false }, mode: 'walk', crouch: true, quiet: true, face });
  }
  o.arrivedAt ??= sim.time;
  if (o.kind === 'push') {
    a.ai.doing = 'push: sweep';
    return sweepArea(sim, a, o);
  }
  if (sim.time - o.arrivedAt >= WATCH_TIME) {
    return holdAndSecure(sim, a);
  }
  const toward = Math.atan2(o.threat.y - a.y, o.threat.x - a.x);
  return I({ crouch: true, steady: true, face: toward + Math.sin((sim.time - o.arrivedAt) * 1.4) * 0.5 });
}

// Note: a sweep covers the cells of the pushed zone in his line of sight and the doorways of the zone.
function startSweep(sim, a, z) {
  const cells = [];
  const doors = [];
  for (const { x, y } of z.cells) {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const r = Math.hypot(cx - a.x, cy - a.y);
    const t = tileAt(sim.map, z.f, x, y);
    if (t === T.DOOR) {
      // Note: a door is looked at from the side its face can be seen from, a step short of its centre.
      const k = r > 0.6 ? (r - 0.6) / r : 0;
      if (r > 0.3 && castRay(sim.map, z.f, a.x, a.y, a.x + (cx - a.x) * k, a.y + (cy - a.y) * k).clear) doors.push({ cx, cy, looked: 0 });
    } else if (!solidAt(sim.map, z.f, x, y) && !isFlight(t) && castRay(sim.map, z.f, a.x, a.y, cx, cy).clear) cells.push({ x, y, cx, cy, skip: false });
  }
  return { cells, doors, focus: null, at: sim.time, from: sim.time };
}

// Note: the cells of a sweep not yet seen since it began and the doorways not yet looked at long enough.
export function sweepProgress(a, sw) {
  const mind = a.ai.mind;
  return {
    open: sw.cells.filter((c) => !c.skip && !(clearStamp(mind, a.floor, c.x, c.y) >= sw.from)),
    doors: sw.doors.filter((d) => d.looked < SWEEP_DWELL),
  };
}

// Note: a sweep looks each way that takes in the most unseen cells and doorways until done or SWEEP_MAX runs out.
function sweepArea(sim, a, o) {
  const now = sim.time;
  if (now < (o.holdUntil ?? 0)) return holdAndSecure(sim, a);
  const sw = o.sweep ?? (o.sweep = startSweep(sim, a, zoneAt(sim, o.spot)));
  const dt = Math.min(0.5, now - sw.at);
  sw.at = now;
  const bearing = (c) => Math.atan2(c.cy - a.y, c.cx - a.x);
  for (const d of sw.doors) if (Math.abs(angleDiff(a.facing, bearing(d))) < SWEEP_ARC) d.looked += dt;
  const { open, doors } = sweepProgress(a, sw);
  const seen = open.length <= sw.cells.length * (1 - SWEEP_SEEN);
  if ((seen && !doors.length) || now - sw.from >= SWEEP_MAX) {
    observeZones(sim, a);
    clearZone(sim, a, zoneAt(sim, o.spot));
    o.trail = [...(o.trail ?? []).filter((key) => key !== zoneAt(sim, o.spot).key), zoneAt(sim, o.spot).key];
    const next = orderPost(sim, a, 'push');
    if (next && !sameZone(sim, next, o.spot)) {
      o.spot = next;
      o.arrivedAt = null;
      o.sweep = null;
      return deputyMoveOrder(sim, a, o);
    }
    // Note: with no zone left to push into he holds the post for a spell, then looks again at what changed.
    o.sweep = null;
    o.holdUntil = now + EXHAUSTED_HOLD;
    return holdAndSecure(sim, a);
  }
  const todo = [...doors, ...open];
  const within = (ang) => todo.filter((c) => Math.abs(angleDiff(ang, bearing(c))) <= SWEEP_ARC);
  // Note: a look is timed from when the turn to it is done.
  if (sw.focus && Math.abs(angleDiff(a.facing, sw.focus.face)) > SWEEP_ARC) sw.focus.since = now;
  const ahead = sw.focus ? within(sw.focus.face) : [];
  if (sw.focus && ahead.length && now - sw.focus.since > SWEEP_GIVE_UP) {
    // Note: cells still unseen after a long look are behind something and are given up.
    for (const c of ahead) if ('skip' in c) c.skip = true;
    sw.focus = null;
  }
  // Note: a look is held at least SWEEP_DWELL, the time his eyes need to take in a facing, and then moves to the facing that takes in the most.
  if (!sw.focus || (now - sw.focus.since >= SWEEP_DWELL && !ahead.length)) {
    const face = todo.map(bearing).sort((p, q) => within(q).length - within(p).length)[0];
    sw.focus = { face: face ?? a.facing, since: now };
  }
  return I({ crouch: true, steady: true, face: sw.focus.face });
}

// Note: Hold and Cover me keep their post through contact until replaced or cancelled (items 426 and 479).
function deputyHoldArea(sim, a, o) {
  const ai = a.ai;
  const h = o.kind === 'cover' ? o.spot : ai.holdSpot;
  if (!h) {
    return holdAndSecure(sim, a);
  }
  if (o.kind === 'hold') ai.state = 'holding';
  if (a.floor !== h.f || dist(a, h) > 0.8) return I({ goal: { x: h.x, y: h.y, f: h.f, r: 0.4, windows: true }, mode: 'walk', quiet: true });
  const intent = I({ crouch: true, steady: true, face: h.arc });
  topUp(a, intent);
  return intent;
}

function scavengeIntent(sim, a) {
  const ai = a.ai;
  // Note: scavenge only when no carried gun can be made ready.
  const loose = !canReady(a) ? looseWeapon(sim, a, 10) : null;
  if (loose) {
    if (dist(a, loose) < 1) return I({ use: { type: 'scavenge', itemId: loose.id, edge: true }, face: Math.atan2(loose.y - a.y, loose.x - a.x) });
    return I({ goal: { x: loose.x, y: loose.y, f: loose.floor, r: 0.8 }, mode: 'walk' });
  }
  if (canReady(a)) return null;
  ai.looted = ai.looted || {};
  const body = sim.actors.find((b) => sim.sees(a, b) && goalAvailable(sim, a, { ...b, f: b.floor }) && b.status !== 'ok' && !ai.looted[b.id] && b.floor === a.floor && dist(a, b) < 10 && sim.hasLoot(b, a));
  if (!body) return null;
  if (dist(a, body) < 1.2) {
    ai.looted[body.id] = true;
    return I({ use: { type: 'scavenge', id: body.id, edge: true }, face: Math.atan2(body.y - a.y, body.x - a.x) });
  }
  return I({ goal: { x: body.x, y: body.y, f: body.floor, r: 1 }, mode: 'walk' });
}

// Note: a door, a stairs cell or a cell next to one is a choke point.
function choke(sim, f, x, y) {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tileAt(sim.map, f, x + dx, y + dy);
    if (t === T.DOOR || isFlight(t)) return true;
  }
  return false;
}

// Note: the way the sheriff walks, or faces when he stands.
function heading(sim, s) {
  const m = s === sim.sheriff ? sim.input?.move : s.t === sim.time ? s.moveDesired : null;
  const len = m ? Math.hypot(m.x, m.y) : 0;
  if (len > 0.1) return { x: m.x / len, y: m.y / len, moving: true };
  return { x: Math.cos(s.facing), y: Math.sin(s.facing), moving: false };
}

// Note: a spot is in the way when it lies on the strip ahead of the sheriff that he is about to walk over.
function inWay(s, h, x, y) {
  const rx = x - s.x;
  const ry = y - s.y;
  const along = rx * h.x + ry * h.y;
  const cross = Math.abs(rx * h.y - ry * h.x);
  return along > -0.3 && along < (h.moving ? 4.5 : 3) && cross < 1;
}

function yieldToSheriff(sim, a, s, fighting = false) {
  if (a.carrying || a.action || a.elev) return null;
  // Note: every lawman steps aside for a sheriff walking into him (item 418).
  const people = [s, ...sim.deputies.filter((o) => o !== a)];
  for (const other of people) {
    if (other.status !== 'ok' || other.withdrawn || a.floor !== other.floor || other.elev || dist(a, other) > 3) continue;
    if (other !== s && !sim.sees(a, other) && dist(a, other) > 1.5) continue;
    if (other !== s && a.mode !== 'idle' && sim.deputies.indexOf(other) > sim.deputies.indexOf(a)) continue;
    const motion = other === s ? heading(sim, s) : other.moveDesired;
    if (!motion || (other === s && !motion.moving) || !inWay(other, { ...motion, moving: true }, a.x, a.y)) continue;
    const sides = [{ x: -motion.y, y: motion.x }, { x: motion.y, y: -motion.x }];
    // Note: stepping aside never steps into a doorway or onto the stairs, where he would be in the way again.
    const side = sides.find((v) => !sim.blocked(a, a.x + v.x * 0.7, a.y + v.y * 0.7) && !choke(sim, a.floor, Math.floor(a.x + v.x * 0.7), Math.floor(a.y + v.y * 0.7)));
    if (!side) continue;
    a.ai.yieldUntil = sim.time + 0.8;
    return I({ move: side, mode: 'walk', fire: false });
  }
  if (!fighting && sim.time < (a.ai.yieldUntil ?? 0)) return I({ fire: false, face: a.facing });
  return null;
}

// Note: a deputy held up against another lawman on his way slips round him instead of pressing into him (item 418).
function steerAround(sim, a) {
  const m = a.moveDesired;
  const len = m ? Math.hypot(m.x, m.y) : 0;
  const body = len > 0.1 && a.mode === 'idle' && a.navState === 'moving' &&
    sim.lawmen.find((o) => o !== a && o.status === 'ok' && o.floor === a.floor && dist(a, o) < PRESSED && (o.x - a.x) * m.x + (o.y - a.y) * m.y > 0);
  if (!body) {
    a.ai.pressedSince = null;
    return null;
  }
  a.ai.pressedSince ??= sim.time;
  if (sim.time - a.ai.pressedSince < PRESSED_WAIT) return null;
  const side = [{ x: -m.y / len, y: m.x / len }, { x: m.y / len, y: -m.x / len }].find((v) => v.x * (a.x - body.x) + v.y * (a.y - body.y) >= 0);
  return I({ move: side, mode: 'walk' });
}

// Note: a standing place must be free, no choke point, off the sheriff's way, in his sight and at tactical distance.
function postOk(sim, a, s, h, x, y, cover, loose) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (solidAt(sim.map, a.floor, tx, ty) || choke(sim, a.floor, tx, ty)) return false;
  const d = Math.hypot(x - s.x, y - s.y);
  const lo = (cover ? 1.6 : 1.4) - (loose ? 0.3 : 0);
  const hi = (cover ? 3 : 3.6) + (loose ? 0.6 : 0);
  if (d < lo || d > hi || inWay(s, h, x, y) || taken(sim, a, x, y, !loose)) return false;
  return castRay(sim.map, a.floor, s.eye.x, s.eye.y, x, y).clear;
}

// Note: the best reachable standing place beside or behind the sheriff, preferring walls and a view ahead.
function pickPost(sim, a, s, h, cover) {
  const mind = a.ai.mind;
  const here = { x: a.x, y: a.y, f: a.floor };
  const cx = Math.floor(s.x);
  const cy = Math.floor(s.y);
  const ahead = { x: s.x + h.x * 5, y: s.y + h.y * 5 };
  const spots = [];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx + 0.5;
      const y = cy + dy + 0.5;
      if (!postOk(sim, a, s, h, x, y, cover, false)) continue;
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oy]) => solidAt(sim.map, a.floor, cx + dx + ox, cy + dy + oy)).length;
      const along = (x - s.x) * h.x + (y - s.y) * h.y;
      let score = -0.35 * Math.hypot(x - a.x, y - a.y) + 0.3 * Math.min(walls, 2) + (seenClear(mind, a.floor, cx + dx, cy + dy) ? 0.25 : 0);
      if (cover) score += -0.3 * along + (castRay(sim.map, a.floor, x, y, ahead.x, ahead.y).clear ? 0.4 : 0);
      // Note: following prefers beside or behind the sheriff.
      else score -= 0.15 * Math.max(0, along);
      spots.push({ x, y, f: a.floor, score });
    }
  }
  spots.sort((p, q) => q.score - p.score);
  for (const c of spots.slice(0, 3)) if (findPath(sim.map, here, c, { windows: true })) return c;
  return null;
}

// Note: the bearing of a fresh noise or an uncleared doorway worth a look, or null.
function scanTarget(sim, a, s) {
  const ai = a.ai;
  const now = sim.time;
  const mind = a.ai.mind;
  const out = (x, y) => Math.atan2(y - a.y, x - a.x);
  const toS = out(s.x, s.y);
  const unseen = (ang) => Math.abs(angleDiff(a.facing, ang)) > 0.9;
  if (ai.noise && now - ai.noise.t < 6 && ai.noise.f === a.floor && unseen(out(ai.noise.x, ai.noise.y))) return { dir: out(ai.noise.x, ai.noise.y), noise: true };
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.y);
  let best = null;
  let bd = 8;
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      if (tileAt(sim.map, a.floor, ax + dx, ay + dy) !== T.DOOR) continue;
      const d = Math.hypot(ax + dx + 0.5 - a.x, ay + dy + 0.5 - a.y);
      if (d >= bd || !unseen(out(ax + dx + 0.5, ay + dy + 0.5)) || Math.abs(angleDiff(toS, out(ax + dx + 0.5, ay + dy + 0.5))) > SCAN_MARGIN + 0.8) continue;
      const far = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([ox, oy]) => ({ x: ax + dx + ox, y: ay + dy + oy }))
        .filter((c) => !solidAt(sim.map, a.floor, c.x, c.y))
        .sort((p, q) => Math.hypot(q.x + 0.5 - a.x, q.y + 0.5 - a.y) - Math.hypot(p.x + 0.5 - a.x, p.y + 0.5 - a.y))[0];
      if (!far || seenClear(mind, a.floor, far.x, far.y)) continue;
      best = { dir: out(ax + dx + 0.5, ay + dy + 0.5), noise: false };
      bd = d;
    }
  }
  return best;
}

// Note: a short look at an uncleared opening, kept within view of the sheriff, or fully round at a noise, else null.
function scanAngle(sim, a, s, cover) {
  const ai = a.ai;
  const now = sim.time;
  if (now >= (ai.scanUntil ?? 0)) {
    if (now < (ai.scanNext ?? 0)) return null;
    const hit = scanTarget(sim, a, s);
    if (!hit) {
      ai.scanNext = now + 1.5;
      return null;
    }
    ai.scanDir = hit.dir;
    ai.scanNoise = hit.noise;
    ai.scanUntil = now + 0.9;
    ai.scanNext = now + (cover ? 3.5 : 6);
  }
  if (ai.scanNoise) return ai.scanDir;
  const toS = Math.atan2(s.y - a.y, s.x - a.x);
  return toS + Math.max(-SCAN_MARGIN, Math.min(SCAN_MARGIN, angleDiff(toS, ai.scanDir)));
}

// Note: after thresh seconds without the sheriff in view the deputy glances back, so hand signals are seen.
function watchSheriff(sim, a, s, intent, thresh = 0.8) {
  const ai = a.ai;
  const now = sim.time;
  if (s.status !== 'ok' || a.carrying || a.action || a.floor !== s.floor) return intent;
  if (dist(a, s) > 14 || !castRay(sim.map, a.floor, a.eye.x, a.eye.y, s.eye.x, s.eye.y).clear) {
    // Note: no glance could find him, so the clock restarts.
    ai.glanceClock = now;
    return intent;
  }
  const glancing = now < (ai.glanceUntil ?? 0);
  if (sim.sees(a, s)) {
    ai.glanceClock = now;
    if (glancing) ai.glanceUntil = Math.min(ai.glanceUntil, now + 0.3);
  } else if (!glancing && now - (ai.glanceClock ?? now) >= thresh) ai.glanceUntil = now + 0.8;
  if (now < (ai.glanceUntil ?? 0)) return { ...intent, face: Math.atan2(s.y - a.y, s.x - a.x) };
  return intent;
}

// Note: in a fight only a covering deputy glances at the sheriff, and never while the target is close, has his gun on him or has just hit him.
function glanceInFight(sim, a, s, intent, target) {
  const ai = a.ai;
  const now = sim.time;
  const covering = !ai.order?.accepted || ai.order.kind === 'cover';
  if (!covering || now < (ai.engageAt ?? 0) || dist(a, target) < 5 || aimsAt(target, a) || recentlyHit(a, now, 2)) return intent;
  const out = watchSheriff(sim, a, s, intent, 3);
  return out === intent ? intent : { ...out, fire: false };
}

// Note: Cover searches for a lost sheriff from his last perceived spot without searching for hostiles (item 446).
function regainContact(sim, a, s) {
  const ai = a.ai;
  const now = sim.time;
  const lost = ai.lost?.t === s.t ? ai.lost : (ai.lost = { t: s.t, stage: 'trail', since: now, from: { x: s.x, y: s.y, f: s.floor } });
  const at = (p) => p.f === a.floor && dist(a, p) < 1;
  const look = () => I({ crouch: true, steady: true, face: (lost.lookFrom ??= a.facing) + (now - lost.since) * LOOK_TURN });
  const next = (stage) => Object.assign(lost, { stage, since: now, lookFrom: null, goal: null });
  if (lost.stage === 'trail') {
    const m = s.moveDesired;
    const len = m ? Math.hypot(m.x, m.y) : 0;
    const [hx, hy] = len > 0.1 ? [m.x / len, m.y / len] : [Math.cos(s.facing), Math.sin(s.facing)];
    lost.goal ??= openFloorCell(sim, lost.from.f, lost.from.x + hx * TRAIL_LEAD, lost.from.y + hy * TRAIL_LEAD, 2) || lost.from;
    if (!at(lost.goal) && a.navState !== 'blocked' && now - lost.since < TRAIL_TIME) return I({ goal: { ...lost.goal, r: 0.8, windows: true }, mode: 'walk' });
    next('look');
  }
  if (lost.stage === 'look') {
    if (now - lost.since < LOOK_TIME) return look();
    next('check');
  }
  const quiet = now - (ai.threatAt ?? -99) >= QUIET_NEEDED;
  if (quiet && !lost.goal) {
    const unseen = [];
    for (const c of ringCells(Math.floor(lost.from.x), Math.floor(lost.from.y), TRAIL_REACH)) {
      if (!solidAt(sim.map, lost.from.f, c.x, c.y) && !seenClear(ai.mind, lost.from.f, c.x, c.y)) unseen.push({ x: c.x + 0.5, y: c.y + 0.5, f: lost.from.f });
    }
    unseen.sort((p, q) => dist(a, p) - dist(a, q));
    lost.goal = unseen.slice(0, 5).find((p) => findPath(sim.map, { x: a.x, y: a.y, f: a.floor }, p, { windows: true })) || null;
    lost.since = now;
  }
  if (lost.goal && !at(lost.goal) && a.navState !== 'blocked' && now - lost.since < TRAIL_TIME) return I({ goal: { ...lost.goal, r: 0.8, windows: true }, mode: 'walk' });
  if (lost.goal) next('look');
  return I({ crouch: true, steady: true, face: Math.atan2(lost.from.y - a.y, lost.from.x - a.x) });
}

function deputyFollow(sim, a, s) {
  const ai = a.ai;
  const now = sim.time;
  // Note: the search starts once he has closed up to the last perceived spot, or cannot get there, and still has no contact.
  if (s.status === 'ok' && now - s.t > LOST_CONTACT && (ai.lost?.t === s.t || (a.floor === s.floor && dist(a, s) < TRAIL_START) || a.navState === 'blocked')) return regainContact(sim, a, s);
  ai.lost = null;
  // Note: every second deputy who sees a senior near the sheriff covers approaches instead, holding the role a moment.
  if (!ai.order && sim.deputies.indexOf(a) % 2 === 1 && elders(sim, a).some((o) => o.status === 'ok' && !o.passive && sim.sees(a, o)) && a.floor === s.floor && dist(a, s) < TEAM_COVER_NEAR) ai.teamCoverHeldUntil = now + TEAM_COVER_HOLD;
  const teammateCover = !ai.order && now < (ai.teamCoverHeldUntil ?? 0) && a.floor === s.floor && dist(a, s) < TEAM_COVER_FAR;
  if (teammateCover) {
    if (now >= (ai.teamCoverUntil ?? 0)) {
      ai.teamCover = chooseZonePost(sim, a, 'cover', s);
      ai.teamCoverUntil = now + TEAM_COVER_REPOST;
    }
    const post = ai.teamCover;
    if (post) {
      // Note: he walks right onto the post, since a post is only clear of the others' bodies on the spot itself.
      if (dist(a, post) > 0.45) return I({ goal: { ...post, r: 0.4, windows: true }, mode: 'walk', crouch: true });
      return I({ crouch: true, steady: true, face: post.arc });
    }
  } else ai.teamCoverUntil = 0;
  const cover = ai.order?.kind === 'cover' && ai.order.accepted;
  const d = dist(a, s);
  const mode = s.mode === 'slow' ? 'slow' : d > 6 && s.mode === 'sprint' ? 'sprint' : 'walk';
  const noisy = ai.noise && now - ai.noise.t < 6;
  const intent = I({ mode, crouch: s.stance === 'crouch' || noisy || cover });
  const line = a.floor === s.floor && castRay(sim.map, a.floor, a.eye.x, a.eye.y, s.eye.x, s.eye.y).clear;
  // Note: he looks where the sheriff looks as far as the sheriff stays well inside his view.
  const toS = Math.atan2(s.y - a.y, s.x - a.x);
  const along = line ? { face: toS + Math.max(-EYE_MARGIN, Math.min(EYE_MARGIN, angleDiff(toS, s.facing))) } : {};
  // Note: out of sight round a corner the deputy closes up until he sees the sheriff again.
  if (a.floor !== s.floor || d > (cover ? 2.6 : 2.8) || (!line && d > 1.6)) {
    // Note: falling behind, he stands up to keep pace unless the sheriff creeps crouched himself.
    return { ...intent, ...along, crouch: intent.crouch && (d <= CATCH_UP || s.stance === 'crouch'), goal: { x: s.x, y: s.y, f: s.floor, r: line ? 2.2 : 1.6, windows: true } };
  }
  const h = heading(sim, s);
  if (!postOk(sim, a, s, h, a.x, a.y, cover, true)) {
    const p = pickPost(sim, a, s, h, cover);
    if (p) return { ...intent, ...along, goal: { ...p, r: 0.35, windows: true }, mode: 'walk' };
  }
  const scan = scanAngle(sim, a, s, cover);
  return { ...intent, ...along, ...(scan != null ? { face: scan } : {}) };
}
