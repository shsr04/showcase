// Note: rare-event spectacles: reads the deck state, drives the sky uniforms, particles and sounds; no sim writes.

import * as THREE from 'three';
import { N } from './config.js';
import { clamp } from './rand.js';

const OMEN_HUE = { comet: 0.58, eclipse: 0.76, aurora: 0.4, storm: 0.6, whalecloud: 0.54, wedding: 0.93, lostchild: 0.09, rareship: 0.12 };
const OMEN_PITCH = { comet: 1.2, eclipse: 0.7, aurora: 1.0, storm: 0.8, whalecloud: 0.6, wedding: 1.3, lostchild: 0.9, rareship: 1.1 };
const KINDS = ['comet', 'eclipse', 'aurora', 'storm', 'whalecloud'];
const RATE = 0.2;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = Math.random;
const finite = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// Note: a pale whale made of a few flat blobs; the cloud passes high over an island.
function makeWhaleCloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xe6f0ff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  geo.userData.shared = true;
  const blob = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  blob(0, 0, 0, 1.5, 1.3, 4.2);
  blob(0, -0.35, 1.6, 1.2, 1.0, 2.0);
  blob(0, 0.1, -3.4, 0.85, 0.7, 1.7);
  blob(0, 0.5, -5.1, 0.35, 0.25, 1.0).rotation.x = -0.4;
  blob(-1.1, 0.75, -6.1, 1.5, 0.12, 0.7);
  blob(1.1, 0.75, -6.1, 1.5, 0.12, 0.7);
  blob(-1.5, -0.7, 0.8, 1.2, 0.12, 1.0).rotation.z = 0.5;
  blob(1.5, -0.7, 0.8, 1.2, 0.12, 1.0).rotation.z = -0.5;
  g.userData.mat = mat; g.userData.geo = geo;
  g.visible = false;
  return g;
}

export class Spectacle {
  constructor(ctx) {
    this.ctx = ctx; // Note: { world, view, fx, sky, target, snd(name, opts, p) } with live getters for world and view.
    this.lv = { comet: 0, eclipse: 0, aurora: 0, storm: 0, whalecloud: 0, omen: 0, spire: 0 };
    this.cur = null; this.omenKey = ''; this.omenHue = 0.75;
    this.primed = false; this.wind = 0; this.flash = 0; this.thunderT = 6; this.pending = [];
    this.swellT = -1e9; this.whale = null; this.spireCache = { t: -9, isl: null };
    this.acc = { star: 0, rain: 0, petal: 0, lantern: 0, mist: 0, fly: 0, wisp: 0 };
    this.sndT = {}; this.folkCache = { t: -9, a: null, b: null, c: null };
    this.lastAnswered = false;
  }

  // Note: events add one-shot cues; the continuous look comes from the deck state in update().
  onEvent(ev) {
    const c = this.ctx; const w = c.world;
    if (!w) return;
    if (ev.type === 'gwlit') this.swellT = w.time;
    else if (ev.type === 'aftermath') {
      if (ev.phase === 'begin') { if (c.view && c.view.markDamage) c.view.markDamage(ev.damage || []); c.snd('thunder', { gain: 0.4, pitch: 0.6 }); }
      else if (c.view && c.view.clearDamage) c.view.clearDamage();
    }
  }

  level(name, target, dt, rate = RATE) {
    const v = this.lv[name];
    this.lv[name] = v < target ? Math.min(target, v + dt * rate) : Math.max(target, v - dt * rate);
    return this.lv[name];
  }

  once(name, key, gap = 0) {
    const t = this.ctx.world.time;
    if (this.sndT[name] === key) return false;
    this.sndT[name] = key; this.sndT[`${name}T`] = t + gap;
    return true;
  }

  findFolk(id) {
    const w = this.ctx.world;
    for (const f of w.folk) if (f.id === id) return f;
    return null;
  }

  update(dt) {
    const c = this.ctx; const w = c.world; const sky = c.sky;
    if (!w || !sky || !sky.spec) return;
    const t = w.time; const sp = sky.spec; const fx = c.fx; const tg = c.target;
    const deck = w.deck || null;
    const act = deck && deck.active && deck.active.kind ? deck.active : null;
    const om = deck && deck.omen && deck.omen.kind && Number.isFinite(deck.omen.at) ? deck.omen : null;
    // Note: the first frame only records the state, so a loaded save does not replay cues.
    const quiet = !this.primed;
    if (act) {
      if (!this.cur || this.cur.data !== act.data || this.cur.kind !== act.kind) {
        this.cur = { kind: act.kind, data: act.data || {}, t0: t, until: act.until, key: Math.random() };
        this.begin(quiet);
      } else this.cur.until = act.until;
    } else if (this.cur) {
      this.cur = null; this.lastAnswered = false;
    }
    const kind = act ? act.kind : '';
    const data = act && act.data ? act.data : {};
    const phase = data.phase || '';
    for (const k of KINDS) {
      let target = kind === k ? 1 : 0;
      if (k === 'storm') target = kind === 'storm' ? (phase === 'after' ? 0 : 1) : 0;
      if (this.lv[k] > 0.001 || target > 0) this.level(k, target, dt, k === 'storm' ? 0.12 : RATE);
    }
    // Note: the omen tint holds until the event starts; a cancelled omen fades away.
    const lead = om ? om.at - t : 99;
    this.level('omen', om && lead <= 62 ? 1 : 0, dt, 0.12);
    if (om) {
      this.omenHue = OMEN_HUE[om.kind] ?? 0.75;
      const key = `${om.kind}|${om.at}`;
      if (key !== this.omenKey) {
        this.omenKey = key;
        if (!quiet && lead <= 62) c.snd('omen', { gain: 0.8, pitch: OMEN_PITCH[om.kind] || 1 });
      }
    } else this.omenKey = '';
    sp.omen = smooth(this.lv.omen); sp.omenHue = this.omenHue;
    // Note: comet and eclipse sweep once over the event window.
    const span = this.cur ? Math.max(8, this.cur.until - this.cur.t0) : 1;
    const u = this.cur ? clamp((t - this.cur.t0) / span, 0, 1) : 0.5;
    sp.comet = smooth(this.lv.comet);
    if (kind === 'comet') {
      const a = finite(data.ang, 0.4);
      const tilt = finite(data.tilt, 0.4);
      sp.cometAng = a;
      sp.cometHue = finite(data.hue, 0.55) % 1;
      sp.cometX = Math.cos(a) * (u - 0.5) * 1.5;
      sp.cometY = clamp(0.62 + Math.sin(a) * (u - 0.5) * 1.5 * tilt, 0.42, 0.95);
    }
    sp.eclipse = smooth(this.lv.eclipse);
    if (kind === 'eclipse') sp.eclX = (u - 0.5) * 0.5 * (finite(data.dir, 1) < 0 ? -1 : 1);
    sp.aurora = smooth(this.lv.aurora);
    if (kind === 'aurora') sp.auroraHue = finite(data.hue, 0.4) % 1;
    sp.storm = smooth(this.lv.storm);
    this.wind = sp.storm * 0.4;
    // Note: swell rises over a few seconds after the beacon is lit, decays slowly and leaves a faint glow.
    const sa = t - this.swellT;
    sp.swell = (sa >= 0 && sa < 200 ? smooth(sa / 4) * Math.exp(-Math.max(0, sa - 4) / 28) : 0) * 0.9 + (w.gw && w.gw.lit ? 0.07 : 0);
    this.spire(dt, sp, w, tg, fx);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.particles(dt, w, tg, fx, kind, data, u);
    this.whaleStep(dt, w, kind, data, u);
    for (let k = this.pending.length - 1; k >= 0; k--) {
      this.pending[k].t -= dt;
      if (this.pending[k].t <= 0) { const p = this.pending.splice(k, 1)[0]; p.fn(); }
    }
    this.primed = true;
  }

  begin(quiet) {
    if (quiet) return;
    const c = this.ctx; const w = c.world; const k = this.cur.kind; const d = this.cur.data;
    const isl = d.isl ? w.islands.get(d.isl) : null;
    const at = isl ? { x: isl.wx, y: isl.cellH(N >> 1, N >> 1), z: isl.wz } : null;
    if (k === 'wedding') c.snd('bells', { gain: 0.9 }, at);
    else if (k === 'lostchild') c.snd('calling', { gain: 0.8 }, at);
    else if (k === 'storm') c.snd('thunder', { gain: 0.7, pitch: 0.7 });
    else if (k === 'rareship') c.snd('spectacle', { gain: 0.6, pitch: 1.2 });
    else c.snd('spectacle', { gain: 0.8, pitch: k === 'eclipse' ? 0.6 : k === 'whalecloud' ? 0.5 : k === 'aurora' ? 0.9 : 1.15 });
  }

  // Note: fog on the Spire isle: the haze and fog range close in while the camera is near it.
  spire(dt, sp, w, tg, fx) {
    const sc = this.spireCache;
    if (w.time - sc.t > 1 || w.time < sc.t) {
      sc.t = w.time; sc.isl = null;
      for (const i of w.islands.values()) if (i.special === 'spire' && i.revealed) { sc.isl = i; break; }
    }
    const isl = sc.isl;
    const d = isl ? Math.hypot(isl.wx - tg.x, isl.wz - tg.z) : 1e9;
    this.level('spire', isl ? smooth(1 - d / 62) : 0, dt, 0.4);
    sp.spire = this.lv.spire;
    if (isl && d < 80) {
      this.acc.mist += dt * 1.3;
      const h = isl.cellH(N >> 1, N >> 1);
      for (; this.acc.mist >= 1; this.acc.mist -= 1) {
        const a = rnd() * 6.283; const r = 6 + rnd() * 9;
        fx.mist(isl.wx + Math.cos(a) * r, h - 0.8 + rnd() * 2.6, isl.wz + Math.sin(a) * r, 1, 0.94);
      }
    }
  }

  particles(dt, w, tg, fx, kind, data, u) {
    const a = this.acc; const wd = w.weather.wind;
    const near = () => ({ x: tg.x + (rnd() - 0.5) * 36, y: tg.y + 8 + rnd() * 6, z: tg.z + (rnd() - 0.5) * 36 });
    if (this.lv.comet > 0.05) {
      a.star += dt * 4 * this.lv.comet;
      const col = new THREE.Color().setHSL(finite(data.hue, 0.55) % 1, 0.4, 0.8);
      for (; a.star >= 1; a.star -= 1) { const p = near(); fx.star(p.x, p.y, p.z, col.r, col.g, col.b); }
    }
    if (this.lv.aurora > 0.05) {
      a.star += dt * 3 * this.lv.aurora;
      const col = new THREE.Color().setHSL((finite(data.hue, 0.4) + (rnd() < 0.5 ? 0 : 0.38)) % 1, 0.7, 0.65);
      for (; a.star >= 1; a.star -= 1) { const p = near(); fx.star(p.x, p.y, p.z, col.r, col.g, col.b); }
    }
    if (this.lv.eclipse > 0.4) {
      a.fly += dt * 3 * this.lv.eclipse;
      for (; a.fly >= 1; a.fly -= 1) fx.firefly(tg.x + (rnd() - 0.5) * 30, tg.y + 0.5 + rnd() * 2, tg.z + (rnd() - 0.5) * 30);
    }
    if (kind === 'storm' && (data.phase || 'run') === 'run' && this.lv.storm > 0.05) {
      const ids = Array.isArray(data.isls) ? data.isls : [];
      a.rain += dt * 380 * this.lv.storm;
      const list = ids.map((id) => w.islands.get(id)).filter((i) => i && i.revealed && Math.hypot(i.wx - tg.x, i.wz - tg.z) < 85);
      for (; a.rain >= 1; a.rain -= 1) {
        if (!list.length) { a.rain = 0; break; }
        const i = list[(rnd() * list.length) | 0];
        const x = (0.1 + rnd() * 0.8) * N; const z = (0.1 + rnd() * 0.8) * N;
        fx.downpour(i.wx + x - N / 2, i.heightAt(x, z) + 7.4, i.wz + z - N / 2);
      }
      if (wd.s > 0 || this.wind > 0) {
        a.wisp += dt * 12 * this.lv.storm;
        for (; a.wisp >= 1; a.wisp -= 1) fx.wind(tg.x + (rnd() - 0.5) * 30 - wd.x * 15, tg.y + rnd() * 6, tg.z + (rnd() - 0.5) * 30 - wd.z * 15, wd.x || 0.7, wd.z || 0.2, 0.6 + this.lv.storm * 0.4);
      }
      if (this.lv.storm > 0.6) {
        this.thunderT -= dt;
        if (this.thunderT <= 0) {
          this.thunderT = 9 + rnd() * 10;
          this.flash = 1;
          this.pending.push({ t: 0.5 + rnd() * 1.4, fn: () => this.ctx.snd('thunder', { gain: 0.8, pitch: 0.8 + rnd() * 0.4 }) });
        }
      }
    }
    if (kind === 'wedding') {
      const fc = this.folkCache;
      if (w.time - fc.t > 2 || w.time < fc.t) { fc.t = w.time; fc.a = this.findFolk(data.a); fc.b = this.findFolk(data.b); }
      const f = fc.a || fc.b;
      const isl = w.islands.get(data.isl);
      const p = f ? w.folkWorldPos(f) : isl ? { x: isl.wx, y: isl.cellH(N >> 1, N >> 1), z: isl.wz } : null;
      if (p && Math.hypot(p.x - tg.x, p.z - tg.z) < 80) {
        const k = smooth(Math.min(1, (w.time - this.cur.t0) / 4));
        a.petal += dt * 26 * k; a.lantern += dt * 1.2 * k;
        for (; a.petal >= 1; a.petal -= 1) fx.petal(p.x + (rnd() - 0.5) * 3.2, p.y + 3.4 + rnd(), p.z + (rnd() - 0.5) * 3.2, wd.x, wd.z);
        for (; a.lantern >= 1; a.lantern -= 1) fx.lantern(p.x + (rnd() - 0.5) * 3, p.y + 0.6, p.z + (rnd() - 0.5) * 3, wd.x * 0.3, wd.z * 0.3);
        if (w.time - (this.sndT.weddingBell || -99) > 28) { this.sndT.weddingBell = w.time; this.ctx.snd('bells', { gain: 0.6 }, p); }
      }
    }
    if (kind === 'lostchild') {
      const isl = w.islands.get(data.isl);
      if (isl && isl.revealed) {
        const c0 = { x: isl.wx, y: isl.cellH(N >> 1, N >> 1), z: isl.wz };
        if (!data.answered) {
          a.lantern += dt * 1.6;
          for (; a.lantern >= 1; a.lantern -= 1) fx.lantern(c0.x + (rnd() - 0.5) * 14, c0.y + 0.6 + rnd(), c0.z + (rnd() - 0.5) * 14, wd.x * 0.3, wd.z * 0.3);
          if (w.time - (this.sndT.callT || -99) > 9) { this.sndT.callT = w.time; this.ctx.snd('calling', { gain: 0.7, pitch: 0.95 + rnd() * 0.15 }, c0); }
        } else if (!this.lastAnswered) {
          this.lastAnswered = true;
          const f = this.findFolk(data.child);
          const p = f ? w.folkWorldPos(f) : c0;
          this.ctx.snd('bells', { gain: 0.8 }, p);
          for (let k = 0; k < 24; k++) fx.sparkle(p.x + (rnd() - 0.5) * 1.2, p.y + 0.4 + rnd() * 1.4, p.z + (rnd() - 0.5) * 1.2, 1);
        }
      }
    }
  }

  whaleStep(dt, w, kind, data, u) {
    const lv = this.lv.whalecloud; const c = this.ctx;
    if (lv <= 0.01) { if (this.whale) this.whale.visible = false; return; }
    if (!this.whale) { this.whale = makeWhaleCloud(); c.view.scene.add(this.whale); }
    const g = this.whale;
    const isl = w.islands.get(data.isl);
    const cx = isl ? isl.wx : c.target.x; const cz = isl ? isl.wz : c.target.z;
    const a = finite(data.ang, 0.5);
    const dx = Math.cos(a); const dz = Math.sin(a);
    const s = (u - 0.5) * 110;
    const bob = Math.sin(w.time * 0.5) * 0.5;
    g.position.set(cx + dx * s, 13 + bob, cz + dz * s);
    g.rotation.set(Math.sin(w.time * 0.5 + 1) * 0.04, Math.atan2(dx, dz), 0);
    g.scale.setScalar(2.1);
    g.userData.mat.opacity = smooth(lv) * 0.8;
    g.visible = true;
    this.acc.wisp += dt * 9 * lv;
    const wd = w.weather.wind;
    for (; this.acc.wisp >= 1; this.acc.wisp -= 1) {
      c.fx.whale(g.position.x + (rnd() - 0.5) * 7 * 2.1 * 0.4 - dx * 6, g.position.y + (rnd() - 0.5) * 2, g.position.z + (rnd() - 0.5) * 3 - dz * 6, wd.x * 0.3 + dx * 0.15, wd.z * 0.3 + dz * 0.15, 1.2);
    }
  }

  // Note: lightning flash after the sky update: a brief hemisphere boost.
  post(sky) {
    if (this.flash > 0.01) sky.hemi.intensity += this.flash * this.flash * 1.4;
  }

  dispose() {
    if (this.whale) {
      if (this.whale.parent) this.whale.parent.remove(this.whale);
      this.whale.userData.mat.dispose(); this.whale.userData.geo.dispose();
      this.whale = null;
    }
  }
}
