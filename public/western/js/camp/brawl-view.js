import { brawlSound } from './scene-sound.js';
// Note: the fight's canvas, keys and pointer; the room and people are drawn as on the saloon floor, and the sim is only read, stepped and given the player's orders.
import { TILE, SCALE } from '../config.js';
import { ensurePerson, personDesc, PERSON_SIZE } from '../sprites.js';
import { stepPhaseAt, STRIDE, SPRINT_STRIDE, FALL_T, fallFrame, fallSide, reactOfHit, reactFrame } from '../anim.js';
import { reducedMotion } from './cfx.js';
import { el, paintRoom, fitRoom, FRAMES } from './saloon-view.js';
import { bakeDusk, drawDusk, drawGlows, drawFixtures } from './saloon-light.js';
import { BrawlScene } from './brawl-scene.js';
import { createScenePointer, aimAngle, pickAlong } from './scene-pointer.js';
import { lineClear } from '../los.js';
import { PATRON_KINDS } from '../people.js';

const MOVE = { ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
const ORDER = { f: 'punch', F: 'punch', g: 'grapple', G: 'grapple', q: 'draw', Q: 'draw', ' ': 'fire', r: 'reload', R: 'reload', t: 'aim', T: 'aim', x: 'leave', X: 'leave' };
const KINDS = PATRON_KINDS.men.map(([kind]) => kind);
const RING = { player: '255, 224, 130', mate: '126, 214, 196', foe: '232, 96, 64' };
// Note: how long the closing beat shows the result before the fight is handed back.
export const END_BEAT = 1.8;
const LABEL = ['Steady', 'Bruised', 'Hurting', 'Dazed'];

// Note: the words for the player's own state; the same cut-offs on every screen.
export function stateLabel(snap, player) {
  if (!player) return 'Watching';
  if (player.gone) return 'Left the fight';
  if (player.status === 'dead' || player.fatal) return 'Dead';
  if (player.status !== 'ok') return 'Knocked out';
  if (player.exit === 'surrendered') return 'Hands up';
  return LABEL[Math.min(3, Math.floor(player.strain * 4))];
}

// Note: a plain reason for an order that did nothing, so a key press is never silent.
export function whyNot(sim, order) {
  const p = sim.player;
  if (!p || sim.done) return '';
  if (p.actor.status !== 'ok') return 'You are down.';
  if (p.gone || p.leaving) return 'You are leaving.';
  const w = sim.weaponOf(p);
  switch (order) {
    case 'punch': return p.cooldown > 0 ? '' : 'Nobody is in reach.';
    case 'grapple': return p.cooldown > 0 ? '' : 'Nobody is close enough to grab.';
    case 'draw': return p.drawn ? '' : !w ? 'You have no revolver.' : 'You cannot draw a revolver now.';
    case 'fire': return !p.drawn ? 'Draw your revolver first (Q).' : w && w.loaded <= 0 ? 'The revolver is empty. Reload (R).' : '';
    case 'reload': return !p.drawn ? 'Draw your revolver first (Q).' : sim.reserveOf(p) <= 0 ? 'No spare rounds.' : 'The revolver is full.';
    case 'aim': return 'Only with a drawn revolver and two foes.';
    default: return '';
  }
}

// Note: opts: paused() stops the world, handsOff() tells that the page needs the mouse (paused() when absent), onHud(info) hears every change of what the panel shows, onEnd() is called once after the closing beat, crowd is the patron count, mood is the light ('day', 'dusk', 'night') or a function that gives it.
export function createBrawlView(sim, opts = {}) {
  const { room } = sim;
  const fit = opts.fit || { w: 976, h: 432 };
  const fitted = fitRoom(room, fit);
  const cell = TILE * fitted.scale;
  const W = room.w * TILE;
  const H = room.h * TILE;
  const store = new Map();
  const shim = { textures: { exists: (key) => store.has(key), addCanvas: (key, c) => store.set(key, c), remove: (key) => store.delete(key) } };
  const size = Math.round((PERSON_SIZE * SCALE) / 2);
  const floor = paintRoom(room);
  const moodNow = () => (typeof opts.mood === 'function' ? opts.mood() : opts.mood) || 'dusk';
  const mood = moodNow();
  const dusk = bakeDusk(room, TILE, mood);

  let calm = reducedMotion();
  const scene = new BrawlScene(room, { seed: sim.spec.seed, crowd: opts.crowd, calm, spots: sim.fighters.filter((f) => f.present).map((f) => ({ x: f.actor.x, y: f.actor.y })) });

  // Note: each fighter wears the clothes of what they are: the sheriff, a deputy of the crew, or a townsman picked by the fight's own numbers.
  const cast = new Map();
  let mates = 0;
  sim.fighters.forEach((f, i) => {
    const player = f === sim.player;
    const base = { name: f.name, status: 'ok', wounds: [], weapons: [], cur: 0, lean: 0, stance: 'stand', facing: 0 };
    if (player) cast.set(f.id, { ...base, id: 'sheriff', role: 'sheriff' });
    else if (f.crew) cast.set(f.id, { ...base, id: `crew-${i}`, role: 'deputy', look: mates++ % 4 });
    else cast.set(f.id, { ...base, id: `patron-${f.look % 997}`, role: 'civilian', kind: KINDS[f.look % KINDS.length] });
  });
  const ringOf = (f) => (f === sim.player ? RING.player : f.side === 'defender' ? RING.mate : RING.foe);

  const canvas = el('canvas', { class: 'brawl-canvas', width: W, height: H, 'aria-hidden': 'true' });
  canvas.style.width = `${room.w * cell}px`;
  canvas.style.height = `${room.h * cell}px`;
  if (fitted.integer) canvas.classList.add('crisp');
  const g = canvas.getContext('2d');
  const banner = el('div', { class: 'brawl-banner', role: 'status', hidden: true });
  const bannerHead = el('b', {});
  const bannerText = el('span', {});
  banner.append(bannerHead, bannerText);
  const wrap = el('div', {
    class: 'brawl-view',
    'data-key': 'brawl-floor',
    tabindex: '0',
    role: 'application',
    'aria-label': 'Saloon fight. Walk with W A S D or the arrow keys. F punches, G grapples, Q draws or holsters the revolver, Space fires, R reloads, X leaves.',
  }, canvas, banner);
  wrap.style.width = `${room.w * cell}px`;
  wrap.style.height = `${room.h * cell}px`;

  const keys = new Set();
  let goal = null;
  let press = null;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let seen = sim.eventNo;
  let stepDistance = 0;
  let ending = null;
  let ended = false;
  let hudKey = '';
  let note = { text: '', until: 0 };
  const fx = [];
  const react = new Map();
  const media = globalThis.matchMedia ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMedia = () => {
    calm = reducedMotion();
    scene.calm = calm;
  };
  if (media && media.addEventListener) media.addEventListener('change', onMedia);

  const orders = {
    punch: () => sim.punch(),
    grapple: () => sim.grapple(),
    draw: () => (sim.player && sim.player.drawn ? sim.holster() : sim.draw()),
    fire: () => sim.fire(),
    reload: () => sim.reload(),
    aim: () => !!sim.cycleAim(),
    leave: () => sim.withdraw(),
  };
  const flash = (text) => {
    note = { text, until: clock + 1.8 };
  };
  const give = (order, target) => {
    if (ended || !sim.player || sim.done) return false;
    const ok = order === 'punch' && target ? sim.punch(sim.player, target) : order === 'fire' && target ? sim.fire(sim.player, target) : orders[order]();
    if (!ok) {
      const why = whyNot(sim, order);
      if (why) flash(why);
    }
    return ok;
  };

  const onKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE[e.key]) {
      keys.add(MOVE[e.key]);
      goal = null;
    } else if (ORDER[e.key]) {
      if (!e.repeat) give(ORDER[e.key]);
    } else if (e.key === 'Tab' && !e.shiftKey && sim.options().aim) {
      if (!e.repeat) give('aim');
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onKeyUp = (e) => {
    if (MOVE[e.key]) {
      keys.delete(MOVE[e.key]);
      e.preventDefault();
    }
  };
  wrap.addEventListener('keydown', onKeyDown);
  wrap.addEventListener('keyup', onKeyUp);
  wrap.addEventListener('blur', () => {
    keys.clear();
    goal = null;
    press = null;
  });

  // Note: pressing and holding walks toward the pointer; a quick press strikes a foe, or shoots when the revolver is out.
  // Note: a mouse is hidden and locked (items 85, 260), so a press goes at the nearest foe on the line from the sheriff toward the unseen pointer, whatever its distance; touch and pen pick the foe under the point.
  const out = () => {
    const me = sim.player;
    return !me || me.gone || me.actor.status !== 'ok' || !!me.exit;
  };
  // Note: the mouse is given back once the sheriff is out of it, the fight is over, or a menu has the page.
  const handsOff = () => !!(ending || ended || out() || (globalThis.document && document.hidden) || (opts.handsOff ? opts.handsOff() : opts.paused && opts.paused()));
  const ptr = createScenePointer(canvas, room, {
    home: () => (sim.player ? sim.player.actor : { x: room.w / 2, y: room.h / 2 }),
    paused: handsOff,
    onUnlock: () => {
      press = null;
      goal = null;
    },
  });
  const foeAlong = () => {
    const me = sim.player;
    if (!me || !sim.active(me)) return null;
    const people = sim.foes(me).map((o) => ({ o, x: o.actor.x, y: o.actor.y }));
    const pick = pickAlong(me.actor, aimAngle(me.actor, ptr.pos, me.actor.facing), people, me.drawn ? { sees: (a, b) => lineClear(room.map, 0, a, b) } : { range: sim.tune.reach });
    return pick ? pick.o : null;
  };
  const foeAt = (p) => {
    const me = sim.player;
    if (!me) return null;
    let best = null;
    for (const o of sim.foes(me)) {
      const d = Math.hypot(o.actor.x - p.x, o.actor.y - p.y);
      if (d < 0.75 && (!best || d < best.d)) best = { o, d };
    }
    return best ? best.o : null;
  };
  ptr.listen('pointerdown', (e) => {
    if (e.button) return;
    wrap.focus({ preventScroll: true });
    const abs = !ptr.locked;
    goal = ptr.read(e);
    ptr.capture(e);
    press = { at: goal, t: e.timeStamp, abs };
    ptr.hold(e);
  });
  ptr.listen('pointermove', (e) => {
    const at = ptr.move(e);
    if (press) goal = at;
  });
  ptr.listen('pointerup', (e) => {
    const quick = press && e.timeStamp - press.t < 350;
    const p = press;
    press = null;
    goal = null;
    if (!quick || !p) return;
    const foe = p.abs ? foeAt(p.at) : foeAlong();
    if (!foe) {
      if (!p.abs && !ended && sim.player && !sim.done) flash(sim.player.drawn ? 'No clear shot that way.' : 'Nobody is in reach that way.');
      return;
    }
    sim.aim(foe.id);
    give(sim.player && sim.player.drawn ? 'fire' : 'punch', foe);
  });
  ptr.listen('pointercancel', () => {
    press = null;
    goal = null;
  });

  const input = () => {
    const me = sim.player;
    if (goal && me) {
      const dx = goal.x - me.actor.x;
      const dy = goal.y - me.actor.y;
      const d = Math.hypot(dx, dy);
      return d > 0.2 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
    }
    return { x: (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), y: (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0) };
  };

  // Note: events carry a number; each one is turned into a picture once, on the first frame that sees it.
  const observe = (silent = false) => {
    for (const e of sim.events) {
      if (e.n <= seen) continue;
      seen = e.n;
      if (!silent && opts.sound) brawlSound(e, opts.sound);
      if (e.type === 'hit') {
        const from = sim.byId(e.who);
        const to = sim.byId(e.target);
        const dir = from && to ? Math.atan2(to.actor.y - from.actor.y, to.actor.x - from.actor.x) : 0;
        const reaction = reactOfHit({ region: e.region, severity: 0.5 + e.severity, side: 0 }, clock, dir);
        // Note: fists keep their short flinch; item 360's sustained response is for gunfire.
        if (reaction) reaction.dur = e.region === 'head' ? 0.35 : 0.5;
        react.set(e.target, reaction);
        fx.push({ kind: 'burst', x: e.x, y: e.y, t0: clock, dur: 0.28, heavy: e.severity >= 0.4 });
      } else if (e.type === 'miss') {
        const from = sim.byId(e.who);
        if (from) fx.push({ kind: 'whiff', x: from.actor.x, y: from.actor.y, a: from.actor.facing, t0: clock, dur: 0.2 });
      } else if (e.type === 'grab') {
        const to = sim.byId(e.target);
        if (to) fx.push({ kind: 'burst', x: to.actor.x, y: to.actor.y, t0: clock, dur: 0.22, heavy: false });
      } else if (e.type === 'shot') {
        const range = e.hit ? e.range : 14;
        fx.push({ kind: 'shot', x: e.from.x, y: e.from.y, a: e.angle, len: range, t0: clock, dur: 0.14 });
        if (e.hit) {
          const to = sim.byId(e.target);
          if (to) {
            react.set(e.target, reactOfHit({ ...e, region: e.region || 'chest' }, clock, e.angle));
            fx.push({ kind: 'burst', x: to.actor.x, y: to.actor.y, t0: clock + range / 120, dur: 0.3, heavy: true });
          }
        }
      } else if (e.type === 'down') {
        const who = sim.byId(e.who);
        if (who) fx.push({ kind: 'dust', x: who.actor.x, y: who.actor.y, t0: clock, dur: 0.5 });
      }
    }
    if (fx.length > 40) fx.splice(0, fx.length - 40);
    for (let i = fx.length - 1; i >= 0; i--) if (clock - fx[i].t0 > fx[i].dur + 0.6) fx.splice(i, 1);
  };

  // Note: the pose the sim reports, put onto the acts the person painter already has.
  const frameOf = (s) => {
    const f = {};
    const out = { f, ox: 0, oy: 0, rot: 0, scale: 1 };
    const armed = s.armed;
    if (s.drawn) f.weapon = 'handgun';
    else if (armed) f.stow = 'handgun';
    const pose = s.pose;
    const dist = s.travel;
    if (pose === 'dead' || pose === 'down') {
      const side = fallSide({ id: s.look, react: react.get(s.id), facing: s.facing || 0 });
      const ff = fallFrame(s.since.fell == null ? FALL_T : s.since.fell + (ending ? clock - ending.at : 0), side);
      f.weapon = 'none';
      f.stow = '';
      f.state = ff.standing ? 'ok' : pose === 'dead' ? 'dead' : 'down';
      if (ff.standing) f.hit = 'chest';
      out.rot = ff.rot;
      out.scale = ff.scale;
      return out;
    }
    switch (pose) {
      case 'surrender':
        f.weapon = 'none';
        f.stow = '';
        f.act = 'signal';
        f.ph = 5 + (Math.floor(clock * 2.2) % 2);
        break;
      case 'flee':
        f.weapon = 'none';
        f.stow = '';
        f.act = 'walk';
        f.ph = stepPhaseAt(dist, SPRINT_STRIDE);
        f.gait = 'sprint';
        break;
      case 'held':
        f.weapon = 'none';
        f.stow = armed ? 'handgun' : '';
        f.act = 'cower';
        f.ph = Math.floor(clock * 7) % 2;
        break;
      case 'grapple':
        f.weapon = 'none';
        f.act = 'lift';
        f.ph = Math.floor(clock * 3) % 2;
        break;
      case 'punch':
        f.weapon = 'none';
        f.act = 'smash';
        f.ph = Math.min(3, Math.floor(s.since.punch / 0.075));
        break;
      case 'fire':
        f.act = 'recoil';
        f.weapon = 'handgun';
        break;
      case 'reload':
        f.weapon = 'handgun';
        f.act = 'reload';
        f.ph = Math.floor(clock * 6) % 8;
        break;
      case 'draw':
        f.act = 'switch';
        f.ph = 1;
        f.weapon = 'none';
        f.stow = 'handgun';
        break;
      case 'walk':
        f.act = 'walk';
        f.ph = stepPhaseAt(dist, STRIDE);
        break;
      case 'stagger':
      case 'hit':
        f.hit = f.hit || 'chest';
        break;
      default:
        break;
    }
    const r = react.get(s.id);
    if (r) {
      const rf = reactFrame(r, clock, s.facing);
      if (rf) {
        out.ox = rf.ox;
        out.oy = rf.oy;
        out.rot = rf.rot;
        out.scale = rf.scale;
        if (rf.hit) f.hit = rf.hit;
      } else if (clock - r.t0 > r.dur) react.delete(s.id);
    }
    return out;
  };

  const sprite = (a, f) => store.get(ensurePerson(shim, personDesc(a, f)));

  const draw = (tex, x, y, facing, o = {}) => {
    if (!tex) return;
    g.save();
    g.translate(x * TILE + (o.ox || 0) * SCALE, y * TILE + (o.oy || 0) * SCALE);
    g.rotate(facing + (o.rot || 0));
    const sc = o.scale || 1;
    g.scale(sc, sc);
    g.drawImage(tex, -size / 2, -size / 2, size, size);
    g.restore();
  };

  const drawFighter = (s) => {
    const a = cast.get(s.id);
    const fr = frameOf(s);
    const a2 = Object.assign(a, { wounds: sim.byId(s.id).actor.wounds.filter((w) => !w.old && (!w.fist || w.severity >= 0.5)) });
    draw(sprite(a2, fr.f), s.x, s.y, s.facing, fr);
  };

  const drawPatron = (a) => {
    const pose = scene.poseOf(a);
    let fr;
    if (pose === 'cower') fr = { act: 'cower', ph: Math.floor(clock * 5 + a.alarm * 7) % 2 };
    else if (pose === 'walk' && a.fleeing) fr = { act: 'walk', ph: stepPhaseAt(a.dist, SPRINT_STRIDE), gait: 'sprint' };
    else fr = (FRAMES[pose] || FRAMES.stand)(a, clock);
    draw(sprite(a, fr), a.x, a.y, a.facing);
  };

  const ring = (s, rgb, alpha) => {
    g.save();
    g.strokeStyle = `rgba(${rgb}, ${alpha})`;
    g.lineWidth = Math.max(1.5, TILE / 24);
    g.beginPath();
    g.ellipse(s.x * TILE, s.y * TILE + 0.03 * TILE, 0.44 * TILE, 0.4 * TILE, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  };

  // Note: a thin bar over each head; it fills as the fighter nears being beaten.
  const bar = (s) => {
    const w = 0.7 * TILE;
    const x = s.x * TILE - w / 2;
    const y = (s.y - 0.62) * TILE;
    const hgt = Math.max(3, TILE / 14);
    g.save();
    g.fillStyle = 'rgba(14, 8, 2, 0.75)';
    g.fillRect(x - 1, y - 1, w + 2, hgt + 2);
    const v = Math.min(1, s.strain);
    g.fillStyle = v < 0.4 ? '#8fcf7a' : v < 0.7 ? '#e6b84a' : '#d9533a';
    g.fillRect(x, y, w * Math.max(0.04, 1 - v), hgt);
    g.restore();
  };

  const effects = () => {
    g.save();
    for (const e of fx) {
      const t = (clock - e.t0) / e.dur;
      if (t < 0 || t > 1) continue;
      g.globalAlpha = Math.max(0, 1 - t);
      if (e.kind === 'burst') {
        const n = e.heavy ? 8 : 5;
        const r0 = (0.1 + 0.34 * t) * TILE;
        g.strokeStyle = e.heavy ? '#fff2c0' : '#ffe9a8';
        g.lineWidth = Math.max(2, TILE / 14);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + e.t0 * 3;
          g.beginPath();
          g.moveTo(e.x * TILE + Math.cos(a) * r0, e.y * TILE + Math.sin(a) * r0);
          g.lineTo(e.x * TILE + Math.cos(a) * (r0 + 0.16 * TILE), e.y * TILE + Math.sin(a) * (r0 + 0.16 * TILE));
          g.stroke();
        }
      } else if (e.kind === 'whiff') {
        g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        g.lineWidth = Math.max(1.5, TILE / 20);
        g.beginPath();
        g.arc(e.x * TILE, e.y * TILE, (0.62 + 0.2 * t) * TILE, e.a - 0.5, e.a + 0.5);
        g.stroke();
      } else if (e.kind === 'shot') {
        const x0 = e.x * TILE + Math.cos(e.a) * 0.5 * TILE;
        const y0 = e.y * TILE + Math.sin(e.a) * 0.5 * TILE;
        g.strokeStyle = '#fff6d0';
        g.lineWidth = Math.max(1.5, TILE / 24);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(e.x * TILE + Math.cos(e.a) * e.len * TILE, e.y * TILE + Math.sin(e.a) * e.len * TILE);
        g.stroke();
        g.globalAlpha = Math.max(0, 1 - t * 3);
        g.fillStyle = '#ffd36a';
        g.beginPath();
        g.arc(x0, y0, 0.2 * TILE, 0, Math.PI * 2);
        g.fill();
      } else if (e.kind === 'dust') {
        g.fillStyle = 'rgba(214, 190, 150, 0.5)';
        g.beginPath();
        g.arc(e.x * TILE, e.y * TILE, (0.3 + 0.5 * t) * TILE, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  };

  // Note: a thin line from the player's drawn revolver to the foe the next shot goes at.
  const sight = (snap) => {
    const me = snap.fighters.find((f) => f.id === snap.player);
    if (!me || !me.drawn || me.status !== 'ok' || me.gone) return;
    const mark = sim.gunFoe(sim.player);
    if (!mark) return;
    g.save();
    g.strokeStyle = 'rgba(232, 96, 64, 0.55)';
    g.setLineDash([4, 5]);
    g.lineWidth = Math.max(1.5, TILE / 28);
    g.beginPath();
    g.moveTo(me.x * TILE, me.y * TILE);
    g.lineTo(mark.actor.x * TILE, mark.actor.y * TILE);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(mark.actor.x * TILE, mark.actor.y * TILE, 0.5 * TILE, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  };

  const render = (snap) => {
    g.drawImage(floor, 0, 0);
    const items = [];
    for (const a of scene.actors) if (!a.gone) items.push({ y: a.y, draw: () => drawPatron(a) });
    for (const s of snap.fighters) {
      if (!s.present || s.gone) continue;
      const lying = s.pose === 'dead' || s.pose === 'down';
      items.push({ y: lying ? s.y - 50 : s.y, draw: () => drawFighter(s) });
    }
    items.sort((p, q) => p.y - q.y);
    // Note: rings go under everyone, so a sprite never hides its own team colour.
    for (const s of snap.fighters) if (s.present && !s.gone && s.status === 'ok') ring(s, ringOf(sim.byId(s.id)), s.exit ? 0.35 : 0.8);
    for (const it of items) it.draw();
    drawDusk(g, dusk);
    drawGlows(g, room, TILE, clock, calm, mood);
    drawFixtures(g, room, TILE, clock, calm);
    for (const s of snap.fighters) if (s.present && !s.gone && s.status === 'ok' && !s.exit) bar(s);
    sight(snap);
    effects();
  };

  const hud = (snap) => {
    const me = snap.fighters.find((f) => f.id === snap.player) || null;
    const options = sim.options();
    const foes = snap.fighters.filter((f) => f.side === 'aggressor' && f.present && !f.gone && f.status === 'ok' && !f.exit).length;
    const allies = snap.fighters.filter((f) => f.side === 'defender' && f.id !== snap.player && !f.gone && f.status === 'ok' && !f.exit).length;
    const line = note.until > clock ? note.text : sim.lastEvent ? sim.lastEvent.text : 'Move up to a troublemaker and hit him.';
    const info = {
      options,
      label: stateLabel(snap, me),
      strain: me ? me.strain : 0,
      loaded: me ? me.loaded : 0,
      reserve: me ? me.reserve : 0,
      out: !me || me.gone || me.status !== 'ok' || !!me.exit,
      armed: !!me && me.armed,
      drawn: !!me && me.drawn,
      held: !!me && !!me.heldBy,
      holding: !!me && !!me.holding,
      foes,
      allies,
      done: snap.done,
      result: snap.result,
      escalated: snap.escalated,
      line,
    };
    info.key = JSON.stringify([info.options, info.label, info.out, Math.round(info.strain * 20), info.loaded, info.reserve, info.drawn, info.held, info.holding, info.foes, info.allies, info.done, info.line]);
    return info;
  };

  const showBanner = (snap) => {
    const me = snap.fighters.find((f) => f.id === snap.player);
    const down = me && me.status !== 'ok';
    bannerHead.textContent = snap.result === 'won' ? 'The fight is over' : 'The fight is lost';
    bannerText.textContent = snap.result === 'won' ? (down ? 'Your side carried it, and you are down.' : 'The troublemakers are beaten or gone.') : 'Your side is beaten.';
    banner.hidden = false;
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    if (opts.onEnd) opts.onEnd();
  };

  const frame = (now) => {
    raf = 0;
    if (!canvas.isConnected) {
      // Note: the lock does not end with the canvas, so a fight that left the page gives the mouse back.
      ptr.release();
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    const idle = (globalThis.document && document.hidden) || (opts.paused && opts.paused());
    if (idle) {
      keys.clear();
      goal = null;
    } else tick(dt);
    if (handsOff()) ptr.release();
    paint();
  };

  const tick = (dt) => {
    clock += dt;
    const player = sim.player?.actor;
    const x = player?.x, y = player?.y;
    if (!ended) sim.step(dt, input());
    if (player && Number.isFinite(x) && Number.isFinite(y)) {
      stepDistance += Math.hypot(player.x - x, player.y - y);
      if (stepDistance >= 0.7) {
        stepDistance %= 0.7;
        if (opts.sound) opts.sound('footstep');
      }
    }
    const snap = sim.snapshot();
    scene.watch({
      gun: sim.escalated,
      fighters: snap.fighters.map((f) => ({ x: f.x, y: f.y, up: f.present && !f.gone && f.status === 'ok' && !f.exit, player: f.id === snap.player })),
    });
    scene.step(dt);
    observe();
    if (snap.done && !ending) {
      ending = { at: clock };
      showBanner(snap);
    }
    if (ending && clock - ending.at >= END_BEAT) finish();
  };

  const paint = () => {
    const snap = sim.snapshot();
    render(snap);
    const info = hud(snap);
    if (info.key !== hudKey) {
      hudKey = info.key;
      if (opts.onHud) opts.onHud(info);
    }
  };

  return {
    el: wrap,
    // Note: the sim and the pointer are read by the browser checks.
    sim,
    pointer: ptr,
    start() {
      if (raf || !canvas.isConnected) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    focus() {
      wrap.focus({ preventScroll: true });
    },
    render() {
      paint();
    },
    give,
    // Note: for a player who is out of it: the rest of the fight is played through at once, and the closing beat follows as usual.
    hurry() {
      if (ended || sim.done) return;
      for (let i = 0; i < 800 && !sim.done; i++) sim.step(0.5, {});
      observe(true); // Fast-forward is silent.
      tick(0);
      paint();
    },
    // Note: the closing beat can be cut short by the player.
    skip() {
      if (sim.done) finish();
    },
    get ended() {
      return ended;
    },
    destroy() {
      this.stop();
      ptr.destroy();
      if (media && media.removeEventListener) media.removeEventListener('change', onMedia);
    },
  };
}
