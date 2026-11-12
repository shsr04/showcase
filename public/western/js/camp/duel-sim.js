// Note: a duel is a stationary exchange whose state stays in the scene; the campaign keeps only the saved starting position.
import { makeActor } from '../actors.js';
import { armHitEffect, ITEM_TIME } from '../arms.js';
import { STEP } from '../config.js';
import { applyMember, skillMods, simSkill } from '../party.js';
import { oldWound, hitTestActor, applyHit, updateWounds, capability, hitReaction, ONE_ARM_RELOAD, SHOCK } from '../wounds.js';
import { fireWeapon, canFireWeapon, tickWeapon, stepSettle, disruptAim, switchTime, startReload, stepReload, canFireWhileReloading, AIM, WEAPONS } from '../weapons.js';
import { rng, clamp, unit } from '../rand.js';
import { simInjuries } from './crew.js';
import { Mind, temperOf, stanceOf } from './duel-mind.js';
import { COCK, FAN, FOLLOW, RING, THROW, inSquare, missOf, scatterOf, follow, lagOf, swayParams, swayAmp, disturbed, swayOffset, fanScatter } from './duel-draw.js';
import { drinkEffects } from './drink.js';

const SIDES = ['player', 'opponent'];
const otherOf = (who) => (who === 'player' ? 'opponent' : 'player');
// Note: a stare is the pointer held on the other's body for this long while still holstered.
const STARE = 2;
// Note: seconds the opponent waits before he answers another surrender or request to stop.
const STOP_PAUSE = 1.5;
// Note: item 357: seconds the nemesis takes to walk up and shoot a fallen sheriff.
export const FINAL_FINISH = 1.2;
// Note: item 354: a wound of at least `medium` severity (0.35, where the game's words turn light into serious) to the head, chest, belly or a leg always drops a duelist; a lighter one to the torso or a leg drops him with `light`, an arm wound with `arm`.
export const FALL = Object.freeze({ medium: 0.35, light: 0.45, arm: 0.08 });
const DROPS = new Set(['head', 'chest', 'abdomen', 'leg']);
export function fallsFrom(region, severity, roll, fall = FALL) {
  if (region === 'arm') return roll < fall.arm;
  if (!DROPS.has(region)) return false;
  return severity >= fall.medium || roll < fall.light;
}
// Note: item 357: seconds a final duel in which neither man can shoot lasts before the worse hurt dies.
export const FINAL_BOTH_DOWN = 20;
// Note: the final duel's winner: the sheriff once the nemesis is dead (revenge, even if he dies too), the nemesis once the sheriff is.
const finalWinner = (sim) => (sim.opponent.status === 'dead' ? 'player' : sim.player.status === 'dead' ? 'opponent' : null);
const onBody = (aim) => Math.abs(aim.lateral) <= 0.45 && aim.height >= 0.6 && aim.height <= 1.75;

// Note: items 448, 450, 451: the draw-last time warp slows the opponent's clock; its strength grows with the sheriff's composure (`warpStrength`, 0 to 1): the slowest speed of the opponent and the real seconds it lasts run from the first number to the second, and the easing in and out takes real seconds.
export const WARP = { floor: [0.55, 0.1], duration: [0.9, 2.4], easeIn: 0.12, easeOut: 0.6 };
const lerp = (pair, k) => pair[0] + (pair[1] - pair[0]) * k;
export const warpOf = (strength = 0.5) => ({ floor: lerp(WARP.floor, clamp(strength, 0, 1)), duration: lerp(WARP.duration, clamp(strength, 0, 1)) });
// Note: how well the sheriff reads and answers the draw: Awareness first (item 467), then nerve, aim and handling; fatigue, drink, a hangover and lasting wounds take from it. A baseline hand gives 0.5.
export function warpStrength(initial, wounds = []) {
  const skill = simSkill(initial.skill);
  const { sway, hangover } = drinkEffects({ drink: initial.intoxication, hangover: initial.hangover });
  const hurt = wounds.reduce((sum, w) => sum + (w.old && w.severity < 0.2 ? 0 : Math.min(1, w.severity || 0)), 0);
  return clamp(0.4 * skill.awareness + 0.3 * skill.nerve + 0.15 * skill.aim + 0.15 * skill.handling - 0.3 * (initial.fatigue || 0) - 0.5 * sway - 0.25 * hangover - 0.15 * hurt, 0, 1);
}
// Note: the opponent's speed after a warp of the given shape has run for t real seconds: 1 outside it.
export function warpSpeed(t, warp = warpOf()) {
  if (!Number.isFinite(t) || t < 0 || t >= warp.duration) return 1;
  const ease = Math.min(1, t / WARP.easeIn, (warp.duration - t) / WARP.easeOut);
  return 1 - (1 - warp.floor) * Math.max(0, ease);
}

export class DuelSim {
  constructor(spec) {
    if (!spec || spec.phase !== 'exchange' || !spec.initial) throw new Error('A saved duel exchange is required.');
    this.spec = spec;
    // Note: the final duel with the nemesis (items 298, 357): no surrender, no stop, no walking away; it ends with a death.
    this.final = !!spec.final;
    this.stuckSince = null;
    // Note: a test-only override of the fall table, so tests of other mechanics can keep a hit man standing.
    this.fall = { ...FALL, ...(spec.fall || {}) };
    this.random = rng(spec.initial.seed);
    this.time = 0;
    // Note: real seconds the opponent's clock has lost to the warp; every stamp of a side is on its own clock (`now`), and only the opponent's lags.
    this.lag = 0;
    // Note: real seconds since the draw-last warp began (item 450); null while it has not, and once spent it never returns.
    this.warpAge = null;
    this.warp = null;
    this.opened = false;
    this.draws = { player: null, opponent: null };
    this.firstDraw = null;
    this.firstShot = null;
    this.roundsFired = 0;
    this.opponentRoundsFired = 0;
    this.done = false;
    // Note: the opponent is down and the sheriff still stands; he may fire on the fallen man or walk away (items 356, 359).
    this.finishing = false;
    this.finish = { shots: 0, hits: 0, killed: false };
    this.surrendered = false;
    this.lastShot = null;
    this.lastEvent = null;
    this.aim = { ...RING.centre };
    // Note: the drink each side carried into the duel (item 346).
    this.intoxication = clamp(spec.initial.player.intoxication || 0, 0, 1);
    this.opponentIntoxication = clamp(spec.initial.opponent.intoxication || 0, 0, 1);
    const loadout = [{ ...spec.weapon.weapon }];
    this.player = makeActor(1, 'sheriff', 0, 0, 0, { loadout, hand: spec.initial.player.hand, name: spec.name });
    this.player.facing = 0;
    applyMember(this.player, { skill: spec.initial.player.skill, fatigue: spec.initial.player.fatigue || 0, injuries: simInjuries(spec.initial.player), loadout, charId: spec.charId });
    this.player.weapons[0].loaded = spec.initial.loaded;
    this.player.ammo[loadout[0].ammoType] = spec.initial.reserve;
    const opponentWeapon = spec.initial.opponent.weapon;
    this.opponent = makeActor(2, 'hostile', spec.distance, 0, 0, { loadout: [opponentWeapon], name: spec.opponent.name });
    // Note: a duelist with a known hand (the nemesis) has its skill applied; a gunslinger keeps the baseline hand.
    if (spec.initial.opponent.skill) this.opponent.mods = skillMods(spec.initial.opponent.skill, 0);
    this.player.salt = spec.initial.seed;
    this.opponent.salt = spec.initial.seed;
    for (const injury of simInjuries(spec.initial.opponent)) this.opponent.wounds.push(oldWound(injury));
    this.opponent.weapons[0].loaded = spec.initial.opponent.loaded;
    this.opponent.ammo[opponentWeapon.ammoType] = spec.initial.opponent.reserve;
    this.opponent.facing = Math.PI;
    const first = spec.initial.opponent;
    // Note: in a watched duel both sides are driven by the sim; otherwise the player side is the person at the controls.
    this.auto = { player: !!spec.watch, opponent: true };
    this.mind = {
      opponent: new Mind(`${spec.initial.seed}:mind:opponent`, first.personality, first.stance),
      player: spec.watch ? new Mind(`${spec.initial.seed}:mind:player`, spec.initial.player.personality, spec.initial.player.stance) : null,
    };
    this.cues = { player: null, opponent: null };
    this.nextShot = { player: Infinity, opponent: Infinity };
    this.reload = { player: null, opponent: null };
    this.weaponHeld = { player: true, opponent: true };
    this.pickup = { player: null, opponent: null };
    this.shots = [];
    this.fallenAt = { player: null, opponent: null };
    this.emptyClicks = 0;
    this.stare = 0;
    this.aimMoved = false;
    this.opponentYielded = false;
    this.yieldRetry = Infinity;
    this.stopRetry = 0;
    // Note: each side's hand: sights that start low in the holster and settle onto the intent once the draw is done, the hammer, and the sway.
    const hand = () => ({ sights: { ...FOLLOW.holster }, cocked: false, cockUntil: null, readyAt: null, sway: { at: 0, kick: 0 }, intent: { ...RING.centre } });
    this.hands = { player: hand(), opponent: hand() };
    this.fanned = 0;
    this.firedAt = -Infinity;
    this.inside = false;
  }

  get sights() { return this.hands.player.sights; }
  set sights(v) { this.hands.player.sights = v; }
  get cocked() { return this.hands.player.cocked; }
  set cocked(v) { this.hands.player.cocked = v; }
  get cockUntil() { return this.hands.player.cockUntil; }
  set cockUntil(v) { this.hands.player.cockUntil = v; }
  get sway() { return this.hands.player.sway; }
  set sway(v) { this.hands.player.sway = v; }

  // Note: how much the shooter's wounds and pain spoil the hand, 0 for a sound one and 1 at the worst.
  load(who = 'player') {
    return clamp((capability(this[who]).aimMul - 1) / 1.5, 0, 1);
  }

  // Note: each side's sway follows its own skill, fatigue, wounds and drink.
  // Note: item 364: a heavier revolver than the Colt sways more and a lighter one less.
  swayOf(who = 'player') {
    const actor = this[who];
    const heft = 1 + 0.15 * ((WEAPONS[actor.weapons[0]?.id]?.weightKg ?? 1.05) - 1.05);
    return swayParams({ gain: capability(actor).aimMul * (actor.mods?.aim ?? 1) * heft, rate: actor.mods?.settle ?? 1, intoxication: who === 'player' ? this.intoxication : this.opponentIntoxication });
  }

  // Note: item 364: a double-action revolver cocks itself with the pull of the trigger; a single-action one is cocked by hand for every shot.
  doubleAction(who) {
    return WEAPONS[this[who].weapons[0].id]?.action === 'double';
  }

  // Note: how long a side takes to bring its revolver out, shortened by its handling; item 346: drink and a hangover slow it.
  drawTime(who) {
    const side = this.spec.initial[who];
    const { slow } = drinkEffects({ drink: side.intoxication, hangover: side.hangover });
    return (switchTime(this[who].weapons[0]) / (this[who].mods?.handling || 1)) * slow;
  }

  now(who) {
    return who === 'opponent' ? this.time - this.lag : this.time;
  }

  readyTime(who) {
    return this.draws[who] + this.drawTime(who);
  }

  // Note: the point the revolver really points at: where the sights have settled plus the sway, held in the square of the aim; the outer ring is this point and the hit model reads this and nothing else.
  point(who = 'player') {
    const hand = this.hands[who];
    const amp = swayAmp(this.swayOf(who), hand.sway, this.now(who));
    const off = swayOffset(`${this.spec.initial.seed}:sway${who === 'player' ? '' : `:${who}`}`, this.now(who), amp, this.spec.distance);
    return inSquare({ lateral: hand.sights.lateral + off.lateral, height: hand.sights.height + off.height });
  }

  disturb(strength, at, who = 'player') {
    at ??= this.now(who);
    this.hands[who].sway = disturbed(this.swayOf(who), this.hands[who].sway, strength, at);
  }

  // Note: the moment a draw is seen: the hand is on the gun, the cue ends and the other side may answer.
  beginDraw(who) {
    if (this.done || (who === 'player' && this.surrendered) || this.draws[who] !== null || !['player', 'opponent'].includes(who) || !this.weaponHeld[who]) return false;
    if (who === 'opponent' && this.opponentYielded) return false;
    const actor = this[who];
    if (actor.status !== 'ok') return false;
    // Note: item 450: only the person at the controls, only on the opening draw, and only when the opponent's actual draw began strictly earlier (a cue or an equal start does not count).
    if (who === 'player' && !this.auto.player && this.warpAge === null && !this.opened && this.firstDraw === 'opponent' && this.draws.opponent !== null && this.draws.opponent < this.time) {
      this.warpAge = 0;
      this.warp = warpOf(warpStrength(this.spec.initial.player, this.player.wounds));
    }
    if (who === 'player') this.opened = true;
    this.draws[who] = this.now(who);
    this.firstDraw ||= who;
    this.cues[who] = null;
    const other = otherOf(who);
    if (this.draws[other] === null) {
      if (who === 'player' && !this.auto.player) {
        // Note: the opponent answers a drawn revolver; the delay comes from the shared stream, as it always did.
        const delay = this.spec.initial.opponent.personality === 'cautious' ? this.random.range(0.5, 1.8) : this.random.range(0.2, 0.8);
        // Note: item 346: drink slows his answer too.
        const slow = drinkEffects({ drink: this.spec.initial.opponent.intoxication, hangover: this.spec.initial.opponent.hangover }).slow;
        this.mind.opponent.react(this.now('opponent'), delay * Math.sqrt(stanceOf(this.spec.initial.opponent.stance).wait) * slow);
      } else if (this.auto[other]) this.mind[other].react(this.now(other), this.mind[other].reflex() * drinkEffects({ drink: this.spec.initial[other].intoxication, hangover: this.spec.initial[other].hangover }).slow);
    }
    return true;
  }

  // Note: in a watched duel the player side belongs to the sim; a call from outside for that side is refused and changes nothing.
  shut(who) {
    return who === 'player' && this.auto.player && !this.inside;
  }

  // Note: the sheriff's draw takes the weapon's draw time; the revolver is cocked as it comes out, and the sights start low in the holster and settle onto the mouse after it. A driven side calls it on its own timer.
  draw(who = 'player') {
    if (this.shut(who) || !this.beginDraw(who)) return false;
    const hand = this.hands[who];
    hand.cocked = true;
    hand.cockUntil = null;
    hand.sights = { ...FOLLOW.holster };
    this.disturb(1, this.readyTime(who), who);
    if (this.auto[who]) {
      this.aimFor(who);
      this.nextShot[who] = this.readyTime(who);
    }
    return true;
  }

  // Note: a driven side picks the point it means to hit, in the band its temper shoots at; this is its inner ring.
  aimFor(who) {
    const mind = this.mind[who];
    const band = this.spec.watch ? temperOf(mind.personality).aim : [1.1, 1.4];
    this.hands[who].intent = { lateral: mind.rand.range(-0.12, 0.12), height: mind.rand.range(band[0], band[1]) };
  }

  // Note: where a side means to shoot: the mouse for the person at the controls, the chosen point for a driven side.
  intentOf(who) {
    return who === 'player' && !this.auto.player ? this.aim : this.hands[who].intent;
  }

  // Note: each shot after the draw needs the hammer drawn back again; it takes time and shakes the aim.
  cock() {
    if (this.auto.player || this.done || this.draws.player === null || this.cocked || this.cockUntil !== null || !this.weaponHeld.player || this.surrendered || this.player.status !== 'ok' || this.time < this.readyTime('player')) return false;
    // Note: the hammer comes back only once the revolver has cycled, so a cock asked for early still ends after the cooldown plus the cock time.
    // Note: item 465: Precision quickens the hands, so the hammer comes back sooner.
    this.cockUntil = this.time + Math.max(0, this.player.weapons[0].cool || 0) + COCK.time / (this.player.mods?.handling || 1);
    return true;
  }

  aimed(lateral, height) {
    if (this.auto.player || !Number.isFinite(lateral) || !Number.isFinite(height)) return;
    const next = inSquare({ lateral, height });
    const dx = Math.atan2(next.lateral, this.spec.distance) - Math.atan2(this.aim.lateral, this.spec.distance);
    const dz = Math.atan2(next.height - 1.4, this.spec.distance) - Math.atan2(this.aim.height - 1.4, this.spec.distance);
    const turn = Math.hypot(dx, dz);
    this.player.settle = Math.max(0, this.player.settle - turn * AIM.turn.loss);
    if (turn > 0.03) this.player.hold = 0;
    // Note: a dead or downed sheriff keeps the way he last faced; the mouse turns only a man who stands.
    if (this.player.status === 'ok') this.player.facing = Math.atan2(next.lateral, this.spec.distance);
    if (turn > 0) this.aimMoved = true;
    this.aim = next;
  }

  // Note: opts.fan fires without cocking, fast and very wide; only the controlled side has a hammer to cock.
  fire(who = 'player', opts = {}) {
    if (this.shut(who)) return { ok: false, reason: 'watched' };
    if (this.done || this.draws[who] === null || (who === 'player' && this.surrendered)) return { ok: false, reason: 'holstered' };
    // Note: items 356, 357, 359: over a fallen opponent the sheriff chooses, finishOff or standDown, and does not decide it by firing.
    if (who === 'player' && this.finishing) return { ok: false, reason: 'choose' };
    if (!this.weaponHeld[who]) return { ok: false, reason: 'dropped' };
    if (who === 'opponent' && this.opponentYielded) return { ok: false, reason: 'yielded' };
    const actor = this[who];
    const target = who === 'player' ? this.opponent : this.player;
    const weapon = actor.weapons[0];
    const t = this.now(who);
    if (who === 'opponent' && (actor.broken || 0) > t) return { ok: false, reason: 'shaken' };
    if (t < this.readyTime(who)) return { ok: false, reason: 'drawing' };
    if (actor.react && t < actor.react.s0 + actor.react.noFire) return { ok: false, reason: 'reeling' };
    const hand = who === 'player' && !this.auto.player;
    const own = this.hands[who];
    const fan = hand && !!opts.fan;
    if (fan && t - this.firedAt < FAN.gap) return { ok: false, reason: 'cooldown' };
    // Note: item 369: a dead round must be cleared first, fanning or not.
    if (t < (own.clearUntil || 0)) return { ok: false, reason: 'clearing' };
    // HACK: a fanned shot skips the cooldown of the last one; the fan gap alone spaces fanned shots.
    if (fan) weapon.cool = 0;
    const can = canFireWeapon(actor, weapon);
    if (!can.ok && can.reason !== 'empty') return can;
    if (this.reload[who] && !canFireWhileReloading(weapon)) return { ok: false, reason: 'reloading' };
    if (!fan && own.cockUntil !== null) return { ok: false, reason: 'cocking' };
    if (!fan && !own.cocked) return { ok: false, reason: 'uncocked' };
    this.reload[who] = null;
    // Note: every side shoots along its own sights; with the rings apart the shot strays by the share of their separation beyond the rings.
    const held = this.point(who);
    const stray = missOf(this.intentOf(who), held);
    const count = who === 'player' ? this.roundsFired : `${who}:${this.opponentRoundsFired}`;
    const error = stray > 0 ? scatterOf(`${this.spec.initial.seed}:stray:${count}`, stray) : { lateral: 0, height: 0 };
    const scatter = fan ? fanScatter(`${this.spec.initial.seed}:fan`, this.fanned, this.spec.distance) : { lateral: 0, height: 0 };
    const aim = { lateral: held.lateral + error.lateral + scatter.lateral, height: held.height + error.height + scatter.height };
    const angle = Math.atan2(aim.lateral, target.x - actor.x);
    // Note: a hand shot leaves the sheriff's facing on the mouse; a driven side turns to the line of his shot.
    if (!hand) actor.facing = angle;
    const result = fireWeapon(actor, weapon, { angle, dist: this.spec.distance, z: aim.height, exact: true }, this.random.next);
    if (!result.ok) {
      if (result.reason === 'empty') this.emptyClicks++;
      // Note: item 369: a dead round is spent, and the hammer must be cocked again to clear it.
      if (result.reason === 'misfire') {
        if (who === 'player') this.roundsFired++;
        else this.opponentRoundsFired++;
        own.cocked = this.doubleAction(who);
        own.clearUntil = t + weapon.cool;
        this.lastEvent = { time: this.time, who, hit: null, misfire: true };
      }
      return result;
    }
    this.firstShot ||= who;
    this.lastShot = this.time;
    own.cocked = this.doubleAction(who);
    if (hand) {
      this.firedAt = t;
      if (fan) {
        this.fanned++;
        weapon.cool = FAN.gap;
        disruptAim(actor, 0, 0);
      }
    }
    this.disturb(fan ? 1 : 0.6, t, who);
    if (who === 'player') this.roundsFired++;
    else this.opponentRoundsFired++;
    const bullet = result.bullet;
    const distance = (target.x - actor.x) / Math.cos(bullet.angle);
    const y = actor.y + distance * Math.sin(bullet.angle);
    const z = bullet.z + distance * bullet.vz;
    const hit = distance > 0 ? hitTestActor(target, target.x, y, z) : null;
    this.lastEvent = { time: this.time, who, hit: hit?.region || null };
    this.shots.push({ ...this.lastEvent });
    if (this.shots.length > 24) this.shots.shift();
    if (hit) this.strike(who, hit, bullet, distance);
    this.checkEnd();
    return { ok: true, hit: hit?.region || null, aim };
  }

  // Note: a hit lands on the target: its wound and stagger, a standing sheriff's sights thrown off, and a revolver dropped by a shot arm.
  strike(who, hit, bullet, distance) {
    const target = who === 'player' ? this.opponent : this.player;
    const clock = this.now(otherOf(who));
    const outcome = applyHit(target, hit, bullet.energy * Math.exp(-(bullet.drag ?? 0.004) * distance), this.random.next, clock, { range: distance, seed: this.spec.initial.seed });
    // Note: item 354: the wound decides the fall; the hit reaction below is the body's own (item 360).
    if (outcome.wound && target.status === 'ok' && fallsFrom(hit.region, outcome.wound.severity, unit(`${this.spec.initial.seed}:fall:${who}:${this.roundsFired}:${this.opponentRoundsFired}`), this.fall)) {
      target.status = 'incapacitated';
      target.cause ||= `a ${hit.region} wound`;
    }
    if (outcome.wound) {
      const reaction = hitReaction(hit.region, outcome.wound.severity, { severe: outcome.wound.severe });
      if (outcome.stop) reaction.noFire = Math.max(reaction.noFire, outcome.stop.kind === 'collapse' ? outcome.stop.delay + 0.15 : SHOCK.stun);
      // Note: a duelist who stays standing cannot fire until the stagger has ended.
      if (target.status === 'ok') reaction.noFire = Math.max(reaction.noFire, reaction.dur);
      target.react = { ...reaction, t0: this.time, s0: clock, dir: bullet.angle, side: hit.side || 0, region: hit.region, severity: outcome.wound.severity };
    }
    if (!outcome.wound || target.status !== 'ok') return;
    const other = otherOf(who);
    this.pickup[other] = null;
    disruptAim(target, target.react.keep);
    {
      // Note: a standing duelist's sights are thrown off and must settle again onto what he aims at.
      const tag = other === 'player' ? this.opponentRoundsFired : `${other}:${this.roundsFired}`;
      const thrown = scatterOf(`${this.spec.initial.seed}:throw:${tag}`, THROW);
      const hand = this.hands[other];
      hand.sights = { lateral: hand.sights.lateral + thrown.lateral, height: hand.sights.height + thrown.height };
      this.disturb(1, clock, other);
    }
    if (hit.region !== 'arm') return;
    this.reload[other] = null;
    if (this.draws[other] !== null && this.weaponHeld[other]) {
      const roll = unit(`${this.spec.initial.seed}:armdrop:${target.id}:${target.wounds.length}:${Math.round(this.time / STEP)}`);
      if (armHitEffect(target, target.weapons[0], { side: hit.side, severity: outcome.wound.severity }, roll).drop) {
        this.weaponHeld[other] = false;
        disruptAim(target, 0);
      }
    }
  }

  reloadWeapon(who = 'player') {
    if (this.shut(who) || this.done || this.draws[who] === null || this.reload[who] || !this.weaponHeld[who] || (who === 'player' && this.surrendered)) return false;
    const actor = this[who];
    if (!capability(actor).handgunOk || this.now(who) < this.readyTime(who)) return false;
    this.reload[who] = startReload(actor, actor.weapons[0]);
    if (this.reload[who] && who === 'player') {
      this.cocked = this.doubleAction('player');
      this.cockUntil = null;
    }
    return !!this.reload[who];
  }

  pickupWeapon(who = 'player') {
    if (this.shut(who) || this.done || this.weaponHeld[who] || this.pickup[who] !== null || (who === 'player' && this.surrendered)) return false;
    const actor = this[who];
    if (!capability(actor).handgunOk || (actor.react && this.now(who) < actor.react.s0 + actor.react.noFire)) return false;
    this.pickup[who] = 0;
    return true;
  }

  // Note: what keeps the sheriff from finishing a fallen opponent now, or null: gave up, gun dropped, hands that cannot hold it, an empty cylinder, or no rounds at all.
  finishBlock() {
    const p = this.player;
    const w = p.weapons[0];
    if (this.surrendered) return 'surrendered';
    if (!this.weaponHeld.player) return 'dropped';
    if (!capability(p).handgunOk) return 'hands';
    if (w.loaded > 0) return null;
    return (p.ammo[w.ammoType] || 0) > 0 ? 'empty' : 'dry';
  }

  // Note: items 357, 359: the sheriff's choice to finish a fallen opponent: one shot at point-blank range that kills, told to the witnesses as a finishing shot; false when he has no round to fire.
  finishOff() {
    if (!this.finishing || this.done || this.finishBlock()) return false;
    const fired = this.roundsFired;
    this.killOutright('player', 'opponent');
    if (this.roundsFired === fired) return false;
    this.finish = { shots: this.finish.shots + 1, hits: this.finish.hits + 1, killed: true };
    this.checkEnd();
    return true;
  }

  // Note: the sheriff turns from a fallen opponent; nothing happens unless the opponent is down and the duel still open.
  standDown() {
    if (!this.finishing || this.done || this.final) return false;
    this.done = true;
    return true;
  }

  // Note: after shots a surrender or a request to stop can fail, and the opponent is not asked again until the pause has passed.
  stopFighting(surrender = false) {
    if (this.final) return false;
    if (this.auto.player || this.done || this.finishing || this.firstShot === null || (!surrender && this.time - this.lastShot < 1)) return false;
    if (surrender) {
      this.surrendered = true;
      this.pickup.player = null;
    }
    if (this.time < this.stopRetry) return false;
    const first = this.spec.initial.opponent;
    const chance = !this.weaponHeld.opponent ? 1 : (surrender ? 0.7 : 0.45) + temperOf(first.personality).calm + stanceOf(first.stance).stop;
    if (this.random.chance(chance)) this.done = true;
    else this.stopRetry = this.time + STOP_PAUSE;
    return this.done;
  }

  checkEnd() {
    for (const who of SIDES) if (this[who].status !== 'ok' && this.fallenAt[who] == null) this.fallenAt[who] = this.time;
    if (this.final) return this.checkFinal();
    // Note: item 356: the man left standing when the other first falls is the winner, whatever befalls him after.
    if (this.winner === undefined) {
      const down = SIDES.filter((who) => this[who].status !== 'ok');
      if (down.length === 1) this.winner = otherOf(down[0]);
      if (down.length === 2) this.winner = null;
    }
    // Note: a fallen foe with a fatal wound is plainly dying, so there is nothing left to finish or walk away from.
    const dying = this.opponent.wounds.some((w) => w.fatal);
    if (this.player.status !== 'ok' || this.opponent.status === 'dead' || (this.opponent.status !== 'ok' && (this.auto.player || dying))) {
      this.done = true;
    } else if (this.opponent.status !== 'ok') this.finishing = true;
  }

  // Note: item 357: the final duel runs until a duelist is dead; a fallen nemesis must be finished, a fallen sheriff is shot dead where he lies.
  checkFinal() {
    const p = this.player;
    const o = this.opponent;
    if (p.status === 'dead' || o.status === 'dead') {
      this.done = true;
      return;
    }
    this.finishing = o.status !== 'ok' && p.status === 'ok';
    // Note: he finishes a fallen sheriff only with a gun in a hand that can use it.
    if (p.status !== 'ok' && o.status === 'ok' && this.weaponHeld.opponent && capability(o).handgunOk && this.time - this.fallenAt.player >= FINAL_FINISH) this.killOutright('opponent', 'player');
    // Note: when neither can shoot any more (both down, or out of rounds or arms), the stalemate lasts FINAL_BOTH_DOWN seconds and then the worse hurt dies.
    const able = (who) => this[who].status === 'ok' && capability(this[who]).handgunOk && (this[who].weapons[0].loaded > 0 || (this[who].ammo[this[who].weapons[0].ammoType] || 0) > 0);
    if (able('player') || able('opponent')) this.stuckSince = null;
    else this.stuckSince ??= this.time;
    if (p.status !== 'dead' && o.status !== 'dead' && this.stuckSince !== null && this.time - this.stuckSince >= FINAL_BOTH_DOWN) {
      const hurt = (a) => a.wounds.reduce((s, w) => s + (w.old ? 0 : w.severity), 0) + (a.status === 'ok' ? 0 : 1);
      this.killOutright(null, hurt(p) >= hurt(o) ? 'player' : 'opponent');
    }
    if (p.status === 'dead' || o.status === 'dead') this.done = true;
  }

  // Note: a shot at point-blank range by who (null for the wounds alone) that kills victim at once.
  killOutright(who, victim) {
    if (who) {
      const shooter = this[who];
      const w = shooter.weapons[0];
      if (w && w.loaded > 0) w.loaded--;
      else if (w && shooter.ammo[w.ammoType] > 0) shooter.ammo[w.ammoType]--;
      else return;
      if (who === 'opponent') this.opponentRoundsFired++;
      else this.roundsFired++;
      this.firstShot ||= who;
      this.lastShot = this.time;
      this.lastEvent = { time: this.time, who, hit: 'head', finishing: true };
      this.shots.push({ ...this.lastEvent });
    }
    applyHit(this[victim], { region: 'head', side: 0 }, 9999, () => 0, this.now(victim));
  }

  // Note: a side that has lost heart in a watched duel: badly hurt, disarmed or out of rounds while the other still stands armed.
  shaken(who) {
    const actor = this[who];
    const foe = this[otherOf(who)];
    if (foe.status !== 'ok' || !this.weaponHeld[otherOf(who)]) return false;
    const weapon = actor.weapons[0];
    const dry = weapon.loaded === 0 && actor.ammo[weapon.ammoType] === 0;
    return actor.wounds.some((w) => !w.old && w.severity >= 0.3) || !this.weaponHeld[who] || dry;
  }

  // Note: in a watched duel a shaken side may give up; the other side then decides, one second at a time, whether to accept.
  yieldCheck(who, chunk) {
    if (this.firstShot === null || this.time - this.lastShot < 0.6 || this.surrendered || this.opponentYielded || !this.shaken(who)) return;
    const mind = this.mind[who];
    const rate = temperOf(mind.personality).quit * (mind.shape.stop >= 0.2 ? 1.5 : mind.shape.stop <= -0.2 ? 0.3 : 1);
    if (!mind.rand.chance(rate * chunk)) return;
    if (who === 'player') {
      this.surrendered = true;
      this.pickup.player = null;
    } else {
      this.opponentYielded = true;
      this.pickup.opponent = null;
    }
    this.nextShot[who] = Infinity;
    this.reload[who] = null;
    this.yieldRetry = this.time + 1;
  }

  // Note: the one who still stands armed answers a surrender: accepted at once or after a pause, else the shooting goes on.
  acceptYield() {
    if (this.time < this.yieldRetry) return;
    const yielder = this.surrendered ? 'player' : 'opponent';
    const taker = otherOf(yielder);
    const mind = this.mind[taker];
    const calm = mind.temper.calm + mind.shape.stop;
    this.yieldRetry = this.time + 1.5;
    if (!this.weaponHeld[taker] || this.random.chance(clamp(0.7 + calm, 0.2, 0.95))) this.done = true;
  }

  // Note: both guns can be empty; the exchange cannot go on.
  spent() {
    const empty = (who) => !capability(this[who]).handgunOk || (this[who].weapons[0].loaded === 0 && this[who].ammo[this[who].weapons[0].ammoType] === 0);
    return !!this.firstShot && empty('player') && empty('opponent');
  }

  // Note: in a watched duel a side may hold fire on a man who is beaten and still standing, to give him the chance to give up.
  sparing(who) {
    const other = otherOf(who);
    return !!this.spec.watch && this.shaken(other) && this.mind[who].mercy(this.now(who));
  }

  // Note: what a driven side does at this instant: show a cue, draw, pick the gun up, shoot or reload.
  pilot(who, chunk) {
    const mind = this.mind[who];
    const t = this.now(who);
    const other = otherOf(who);
    const yielded = who === 'player' ? this.surrendered : this.opponentYielded;
    if (this.draws[who] === null) {
      if (yielded) return;
      if (who === 'opponent' && !this.auto.player && !this.surrendered && this.aimMoved && this.draws.player === null) {
        this.stare = onBody(this.aim) ? this.stare + chunk : 0;
        if (this.stare >= STARE) mind.stared(t);
      }
      this.cues[who] = mind.step(t);
      if (t >= mind.drawAt) this.draw(who);
      return;
    }
    if (yielded) return;
    if (!this.weaponHeld[who] && !this.pickup[who] && (this[who].broken || 0) <= t) this.pickupWeapon(who);
    if (this.weaponHeld[who] && this.draws[who] !== null && t >= this.nextShot[who] && !this.reload[who] && !this.sparing(who)) {
      const hand = this.hands[who];
      if (!hand.cocked) hand.readyAt = null;
      else hand.readyAt ??= t;
      if (this[who].weapons[0].loaded <= 0) {
        if (!this.reloadWeapon(who)) this.nextShot[who] = Infinity;
      } else if (!hand.cocked) {
        // Note: like the sheriff, a driven side cocks for every shot after the draw; the hammer comes back once the revolver has cycled.
        if (hand.cockUntil === null) hand.cockUntil = t + Math.max(0, this[who].weapons[0].cool || 0) + COCK.time / (this[who].mods?.handling || 1);
      } else if (missOf(hand.intent, this.point(who)) === 0 || t - hand.readyAt >= temperOf(mind.personality).patience) {
        // Note: he fires once the rings line up, or when his temper will wait no longer.
        if (this.fire(who).ok) this.aimFor(who);
      }
    }
    if (this.spec.watch && this.draws[other] !== null) this.yieldCheck(who, chunk);
  }

  // Note: the opponent's speed now: 1, or the warp's slowdown while it runs.
  speed() {
    return this.warpAge === null ? 1 : warpSpeed(this.warpAge, this.warp);
  }

  step(dt) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return;
    // Note: small steps keep reload, draw and wound timers independent of frame rate.
    let left = Math.min(dt, 1);
    while (left > 1e-8 && !this.done) {
      const real = Math.min(left, 0.05);
      left -= real;
      // Note: the warp slows the opponent's clock only: his draw, aim, hammer, reloads, wounds and mind (item 451); the player's clock and the mouse run in real time.
      const slow = real * this.speed();
      if (this.warpAge !== null) this.warpAge += real;
      this.time += real;
      this.lag += real - slow;
      for (const who of SIDES) {
        const chunk = who === 'opponent' ? slow : real;
        const actor = this[who];
        const weapon = actor.weapons[0];
        tickWeapon(weapon, chunk);
        stepSettle(actor, weapon, chunk, { steady: this.weaponHeld[who] && this.draws[who] !== null && !this.reload[who], mode: 'idle' });
        if (this.reload[who]) {
          const rate = (capability(actor).oneArm ? ONE_ARM_RELOAD : 1) * (actor.mods?.handling ?? 1);
          if (stepReload(actor, weapon, this.reload[who], chunk * rate).done) this.reload[who] = null;
        }
        if (this.pickup[who] !== null) {
          this.pickup[who] += chunk;
          if (this.pickup[who] >= ITEM_TIME) {
            this.pickup[who] = null;
            this.weaponHeld[who] = true;
            disruptAim(actor, 0);
            // Note: a revolver picked up from the dirt is holstered again; either side has to draw anew before it can be cocked or fired.
            this.draws[who] = null;
            this.hands[who].cocked = false;
            this.hands[who].cockUntil = null;
          }
        }
        updateWounds(actor, chunk, this.now(who), this.random.next);
      }
      for (const who of SIDES) {
        const hand = this.hands[who];
        const chunk = who === 'opponent' ? slow : real;
        const t = this.now(who);
        // Note: once a draw is done, the sights settle from the holster onto what the side aims at.
        if (this.draws[who] !== null && t >= this.readyTime(who)) hand.sights = follow(hand.sights, this.intentOf(who), chunk, lagOf(this[who].mods?.settle ?? 1));
        if (hand.cockUntil !== null && t >= hand.cockUntil) {
          hand.cockUntil = null;
          hand.cocked = true;
          this.disturb(COCK.disturb, t, who);
        }
      }
      this.checkEnd();
      if (this.done) break;
      this.inside = true;
      for (const who of SIDES) if (this.auto[who] && this[who].status === 'ok') this.pilot(who, who === 'opponent' ? slow : real);
      this.inside = false;
      if (!this.done && (this.surrendered || this.opponentYielded) && this.spec.watch) this.acceptYield();
      // Note: empty guns end only an ordinary duel; checkFinal settles the final one with a death (item 357).
      if (!this.done && !this.final && this.spent()) this.done = true;
      // Note: a watched duel has no one to end it, so it stops after five minutes whatever happens.
      if (!this.done && this.spec.watch && this.time > 300) this.done = true;
    }
  }

  view() {
    const drawState = (who) => this.draws[who] === null ? 'holstered' : this.now(who) < this.readyTime(who) ? 'drawing' : 'drawn';
    const progress = (who) => (this.draws[who] === null ? 0 : clamp((this.now(who) - this.draws[who]) / this.drawTime(who), 0, 1));
    const sights = this.auto.player ? null : this.point();
    const cue = (who) => this.draws[who] === null ? this.cues[who] : null;
    return {
      time: this.time, warp: this.warpAge !== null && this.speed() < 1 ? this.speed() : null, player: drawState('player'), opponent: drawState('opponent'), opponentDrawProgress: progress('opponent'), playerDrawProgress: progress('player'),
      cue: !!cue('opponent'), cueKind: cue('opponent')?.kind || null, playerCue: !!cue('player'), playerCueKind: cue('player')?.kind || null,
      lastEvent: this.lastEvent && { ...this.lastEvent }, shots: this.shots.map((e) => ({ ...e })), weaponHeld: { ...this.weaponHeld }, pickingUp: { player: this.pickup.player !== null, opponent: this.pickup.opponent !== null },
      loaded: this.player.weapons[0].loaded, reserve: this.player.ammo[this.player.weapons[0].ammoType], reloading: !!this.reload.player, surrendered: this.surrendered, opponentYielded: this.opponentYielded,
      final: this.final, done: this.done, finishing: this.finishing && !this.done, playerStatus: this.player.status, opponentStatus: this.opponent.status,
      reactions: { player: this.player.react && { ...this.player.react }, opponent: this.opponent.react && { ...this.opponent.react } },
      fallenAt: { ...this.fallenAt }, facing: { player: this.player.facing, opponent: this.opponent.facing },
      hammer: { cocked: this.cocked, cocking: this.cockUntil !== null },
      sights,
      rings: sights && { inner: { ...this.aim }, outer: sights, aligned: missOf(this.aim, sights) === 0 },
    };
  }

  report() {
    if (!this.done) return null;
    const wounds = (actor) => actor.wounds.filter((w) => !w.old).map((w) => ({ region: w.region, side: w.side, severity: Math.min(1, w.severity), fatal: !!w.fatal }));
    const status = (actor) => actor.status === 'ok' ? 'stopped' : actor.status;
    return { seconds: this.time, roundsFired: this.roundsFired, opponentRoundsFired: this.opponentRoundsFired, playerStatus: status(this.player), opponentStatus: status(this.opponent), firstDraw: this.firstDraw, firstShot: this.firstShot, wounds: wounds(this.player), opponentWounds: wounds(this.opponent), weaponHeld: this.weaponHeld.player, lostLoaded: this.weaponHeld.player ? 0 : this.player.weapons[0].loaded, opponentWeaponHeld: this.weaponHeld.opponent, opponentLostLoaded: this.weaponHeld.opponent ? 0 : this.opponent.weapons[0].loaded, surrendered: this.surrendered, opponentYielded: this.opponentYielded, finish: { ...this.finish }, fellTogether: this.fallenAt.player !== null && this.fallenAt.player === this.fallenAt.opponent, winner: this.winner ?? (this.final ? finalWinner(this) : null) };
  }
}
