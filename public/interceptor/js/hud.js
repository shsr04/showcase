// Note: DOM overlays in game pixels: dashboard, objective, toasts, barks with timed replies, panels, map, help and pause.

import { TILE, VIEW_W, VIEW_H } from './config.js';
import { PAL, C } from './palette.js';
import { TILE_PROPS } from './tiles.js';
import { sampleTile } from './worldgen.js';

const $ = (id) => document.getElementById(id);
const U = (n) => `calc(${n} * var(--u))`;

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const condCol = (p) => (!p || p.cond <= 0 ? C.SHADOW : p.cond >= 60 ? C.GRASS : p.cond >= 35 ? C.AMBER : C.RED);

export class Hud {
  constructor() {
    this.el = {
      wound: $('wound'), objective: $('objective'), toast: $('toast'), barks: $('barks'), prompt: $('prompt'),
      radio: $('radioLine'), panel: $('panel'), map: $('map'), mapCanvas: $('mapCanvas'), mapInfo: $('mapInfo'),
      help: $('help'), pause: $('pause'), pauseInfo: $('pauseInfo'),
      fuelBar: $('dFuelBar'), fuel: $('dFuel'), speed: $('dSpeed'), water: $('dWater'), gun: $('dGun'), ammo: $('dAmmo'),
      car: $('dCar'), temp: $('dTemp'), station: $('dStation'), radioDial: $('dRadio'), day: $('dDay'), clock: $('dClock'),
    };
    this.cache = {};
    this.toastT = 0;
    this.radioT = 0;
    this.voiceRef = null;
    this.voiceEl = null;
    this.barkEls = new Map();
    this.mapKey = '';
    this.terrain = null;
    this.reset();
  }

  reset() {
    this.set('objective', '');
    this.prompt('');
    this.closePanel();
    this.showMap(false);
    this.showHelp(false);
    this.showPause(false);
    this.el.toast.classList.remove('is-on');
    this.el.radio.classList.remove('is-on');
    this.el.barks.innerHTML = '';
    this.barkEls.clear();
    this.voiceRef = null;
    this.voiceEl = null;
    this.el.wound.style.opacity = '0';
    this.cache = {};
  }

  // Note: writes innerHTML only when the content changed.
  set(name, html) {
    if (this.cache[name] === html) return;
    this.cache[name] = html;
    this.el[name].innerHTML = html;
  }

  objective(o) {
    this.set('objective', o ? `${esc(o[0])}${o[1] ? `<small>${esc(o[1])}</small>` : ''}` : '');
  }

  toast(text, secs = 2.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('is-on');
    this.toastT = secs;
  }

  radioLine(text, secs = 7) {
    this.el.radio.textContent = text;
    this.el.radio.classList.add('is-on');
    this.radioT = secs;
  }

  prompt(html) {
    this.set('prompt', html || '');
  }

  tick(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.remove('is-on');
    }
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) this.el.radio.classList.remove('is-on');
    }
  }

  // Note: d = {fuel, tank, mph, water, gun, mag, ammo, reloading, parts, temp, station, signal, day, clock, onFoot}.
  dash(d) {
    const pct = d.tank > 0 ? Math.max(0, Math.min(100, (d.fuel / d.tank) * 100)) : 0;
    this.el.fuelBar.style.width = `${pct.toFixed(0)}%`;
    this.text('fuel', d.tank > 0 ? d.fuel.toFixed(1) : '--', d.tank > 0 && d.fuel < 2);
    this.text('speed', d.mph == null ? '--' : String(d.mph));
    this.text('water', String(d.water), d.water <= 1);
    // Note: the guns stay in the car; on foot the count only matters as currency.
    this.text('gun', d.onFoot ? 'AMMO' : d.gun);
    this.text('ammo', d.reloading ? 'RELOAD' : d.onFoot ? String(d.mag + d.ammo) : `${d.mag}/${d.ammo}`, d.mag + d.ammo <= 6);
    this.text('temp', d.temp > 1 ? 'OVERHEAT' : d.temp > 0.75 ? 'HOT' : '');
    this.text('station', d.station);
    this.text('radioDial', d.signal);
    this.text('day', `DAY ${d.day}`);
    this.text('clock', d.clock);
    const sig = d.parts ? Object.values(d.parts).map((p) => (p ? Math.round(p.cond / 10) : 'x')).join(',') : 'none';
    if (sig !== this.cache.carSig) {
      this.cache.carSig = sig;
      drawCarIcon(this.el.car, d.parts);
    }
  }

  text(name, value, low = false) {
    const key = `${value}|${low}`;
    if (this.cache[name] === key) return;
    this.cache[name] = key;
    this.el[name].textContent = value;
    this.el[name].classList.toggle('is-low', low);
  }

  // Note: v = {who, text, hostile, replies, t, timeout}; sx, sy are screen px of the speaker; canPay(reply) greys out options.
  voice(v, sx, sy, canPay) {
    if (!v) {
      if (this.voiceEl) this.voiceEl.remove();
      this.voiceEl = null;
      this.voiceRef = null;
      return;
    }
    if (this.voiceRef !== v) {
      if (this.voiceEl) this.voiceEl.remove();
      const el = document.createElement('div');
      el.className = `bark is-voice${v.hostile ? ' is-hostile' : ''}`;
      const opts = v.replies.map((r, i) => `<li class="${canPay(r) ? '' : 'is-off'}">${i + 1} ${esc(r.label)}</li>`).join('');
      el.innerHTML = `<b>${esc(v.who)}</b> ${esc(v.text)}<ol>${opts}</ol><div class="timer"></div>`;
      this.el.barks.append(el);
      this.voiceEl = el;
      this.voiceRef = v;
    }
    placeBark(this.voiceEl, sx, sy);
    this.voiceEl.querySelector('.timer').style.transform = `scaleX(${Math.max(0, 1 - v.t / v.timeout)})`;
  }

  // Note: list = [{id, who, text, sx, sy, hostile}] of short one-line barks.
  barks(list) {
    const live = new Set();
    for (const b of list) {
      live.add(b.id);
      let el = this.barkEls.get(b.id);
      const html = `${b.who ? `<b>${esc(b.who)}</b> ` : ''}${esc(b.text)}`;
      if (!el) {
        el = document.createElement('div');
        this.el.barks.append(el);
        this.barkEls.set(b.id, el);
      }
      if (el.dataset.html !== html) {
        el.dataset.html = html;
        el.innerHTML = html;
        el.className = `bark${b.hostile ? ' is-hostile' : ''}`;
      }
      placeBark(el, b.sx, b.sy);
    }
    for (const [id, el] of this.barkEls) {
      if (!live.has(id)) {
        el.remove();
        this.barkEls.delete(id);
      }
    }
  }

  // Note: rows = [{key, label, info, cls, off} | {head}]; foot is a hint line; side rows go in a second column.
  panel(title, rows, foot = '', sub = '', side = null) {
    const list = (rs) => {
      let html = '<ul>';
      for (const r of rs) {
        if (r.head) {
          html += `</ul><h4>${esc(r.head)}</h4><ul>`;
          continue;
        }
        const k = r.key ? `<kbd>${esc(r.key)}</kbd> ` : '';
        html += `<li class="${r.off ? 'is-off' : ''}"><span>${k}${esc(r.label)}</span><i class="${r.cls || ''}">${esc(r.info || '')}</i></li>`;
      }
      return `${html}</ul>`;
    };
    let html = `<h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`;
    html += side ? `<div class="cols"><div>${list(rows)}</div><div>${list(side)}</div></div>` : list(rows);
    if (foot) html += `<p class="foot">${esc(foot)}</p>`;
    this.el.panel.classList.remove('is-hidden', 'is-wide');
    this.el.panel.classList.toggle('is-cols', !!side);
    this.set('panel', html);
  }

  // Note: g = {title, remark, sub, sections: [{head, rows}], foot}; a row is a swap {key, slot, name, cur, next, delta, note, off} or a line {key, label, info, off}.
  garage(g) {
    let html = `<h3>${esc(g.title)}</h3>${g.remark ? `<p class="remark">Mechanic: "${esc(g.remark)}"</p>` : ''}<p class="sub">${esc(g.sub)}</p>`;
    if (g.sections.some((s) => s.rows.some((r) => r.slot))) {
      html += '<div class="gswap ghead"><kbd></kbd><b></b><span></span><i>in the car</i><u></u><i>after</i><em>change</em></div>';
    }
    for (const s of g.sections) {
      html += `<h4>${esc(s.head)}</h4>`;
      for (const r of s.rows) {
        const k = `<kbd>${esc(r.key || '')}</kbd>`;
        const off = r.off ? ' is-off' : '';
        if (!r.slot) {
          html += `<div class="gline${off}">${k}<span>${esc(r.label)}</span><i>${esc(r.info || '')}</i></div>`;
          continue;
        }
        const d = r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : '';
        html += `<div class="gswap${off}">${k}<b>${esc(r.slot)}</b><span>${esc(r.name)}</span>`
          + `<i class="${r.cur.cls}">${esc(r.cur.text)}</i><u>→</u><i class="${r.next.cls}">${esc(r.next.text)}</i>`
          + `<em class="${d}">${r.delta > 0 ? '+' : ''}${r.delta}</em><small>${esc(r.note)}</small></div>`;
      }
    }
    if (g.foot) html += `<p class="foot">${esc(g.foot)}</p>`;
    this.el.panel.classList.remove('is-hidden', 'is-cols');
    this.el.panel.classList.add('is-wide');
    this.set('panel', html);
  }

  closePanel() {
    this.el.panel.classList.remove('is-wide', 'is-cols');
    this.el.panel.classList.add('is-hidden');
    this.set('panel', '');
  }

  showHelp(on) {
    this.el.help.classList.toggle('is-hidden', !on);
  }

  showPause(on, info = '') {
    this.el.pause.classList.toggle('is-hidden', !on);
    if (on) this.el.pauseInfo.textContent = info;
  }

  showMap(on) {
    this.el.map.classList.toggle('is-hidden', !on);
  }

  wound(level) {
    this.el.wound.style.opacity = String(Math.max(0, Math.min(1, level)));
  }

  // Note: west-up window around the player at 2 tiles per pixel, plus a strip of the whole band on the right.
  drawMap(world, m) {
    const W = 160;
    const H = 200;
    const SW = 14;
    const cnv = this.el.mapCanvas;
    if (cnv.width !== W + SW + 4) {
      cnv.width = W + SW + 4;
      cnv.height = H;
    }
    const ctx = cnv.getContext('2d');
    const scale = world.w / W;
    const rows = H * scale;
    const top = Math.max(0, Math.min(world.h - rows, Math.round((m.py / TILE - rows / 2) / 40) * 40));
    const key = `${world.seedStr}:${world.kind}:${top}`;
    if (this.mapKey !== key) {
      this.mapKey = key;
      this.terrain = document.createElement('canvas');
      this.terrain.width = W;
      this.terrain.height = H;
      const tctx = this.terrain.getContext('2d');
      const img = tctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = sampleTile(world, (x + 0.5) * scale, top + (y + 0.5) * scale);
          const hex = PAL[mapColor(t)];
          const i = (y * W + x) * 4;
          img.data[i] = parseInt(hex.slice(1, 3), 16);
          img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
          img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
          img.data[i + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
    }
    ctx.fillStyle = PAL[C.VOID];
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.drawImage(this.terrain, 0, 0);
    const toWin = (px, py) => [px / TILE / scale, (py / TILE - top) / scale];
    for (const s of m.sites) {
      const [x, y] = toWin((s.x + s.w / 2) * TILE, (s.y + s.h / 2) * TILE);
      if (y < -3 || y > H + 3) continue;
      ctx.fillStyle = PAL[C.VOID];
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      ctx.fillStyle = PAL[s.garage ? C.AMBER : C.BONE];
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
    for (const c of m.cars) {
      const [x, y] = toWin(c.x, c.y);
      ctx.fillStyle = PAL[C.WATER_L];
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    if (m.checkpoint) {
      const [, y] = toWin(0, m.checkpoint);
      ctx.fillStyle = PAL[C.RED];
      if (y > 0 && y < H) ctx.fillRect(0, Math.round(y), W, 1);
    }
    const [px, py] = toWin(m.px, m.py);
    if (m.blink) {
      ctx.fillStyle = PAL[C.RED];
      ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
    }
    ctx.fillStyle = PAL[C.WHITE];
    ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
    // Note: the whole corridor as a strip, the Sabine at the top.
    const sx = W + 4;
    ctx.fillStyle = PAL[C.ASPH_D];
    ctx.fillRect(sx, 0, SW, H);
    const k = H / world.h;
    for (const r of m.rivers) {
      ctx.fillStyle = PAL[C.WATER_L];
      ctx.fillRect(sx, Math.round(r * k), SW, 1);
    }
    for (const g of m.garages) {
      ctx.fillStyle = PAL[C.AMBER];
      ctx.fillRect(sx + 3, Math.round(g * k) - 1, SW - 6, 2);
    }
    ctx.strokeStyle = PAL[C.BONE];
    ctx.strokeRect(sx + 0.5, (top * k) + 0.5, SW - 1, rows * k - 1);
    ctx.fillStyle = PAL[C.RED];
    ctx.fillRect(sx + 1, Math.round((m.py / TILE) * k) - 1, SW - 2, 3);
    this.set('mapInfo', m.info);
  }
}

function mapColor(t) {
  const p = TILE_PROPS[t].paint;
  if (p.kind === 'lane' || p.kind === 'edge' || p.kind === 'asphalt' || p.kind === 'cracked' || p.kind === 'lot') return C.ASPH_L;
  if (p.kind === 'planksH') return C.BONE;
  if (p.kind === 'wall' || p.kind === 'planks' || p.kind === 'counter' || p.kind === 'door') return C.BONE_L;
  return p.base;
}

function placeBark(el, sx, sy) {
  const x = Math.max(70, Math.min(VIEW_W - 70, sx));
  // Note: near the top edge the box hangs below its anchor so it stays readable.
  const below = sy < 96;
  const y = below ? Math.max(48, sy + 16) : Math.min(VIEW_H - 40, sy);
  el.classList.toggle('is-below', below);
  el.style.left = U(x.toFixed(1));
  el.style.top = U(y.toFixed(1));
}

// Note: damage silhouette, nose to the right; each slot is a region colored by condition.
function drawCarIcon(cnv, parts) {
  const ctx = cnv.getContext('2d');
  ctx.clearRect(0, 0, cnv.width, cnv.height);
  if (!parts) return;
  const box = (x, y, w, h, col) => {
    ctx.fillStyle = PAL[col];
    ctx.fillRect(x, y, w, h);
  };
  box(3, 3, 34, 14, parts.armor && parts.armor.cond > 0 ? condCol(parts.armor) : C.ASPH);
  box(4, 4, 32, 12, C.ASPH_D);
  box(5, 6, 6, 8, condCol(parts.fueltank));
  box(13, 5, 4, 10, condCol(parts.suspension));
  box(18, 8, 8, 4, condCol(parts.transmission));
  box(27, 6, 6, 8, condCol(parts.engine));
  box(34, 6, 2, 8, condCol(parts.radiator));
  box(27, 4, 3, 2, condCol(parts.battery));
  for (const [x, y] of [[6, 1], [27, 1], [6, 17], [27, 17]]) box(x, y, 6, 2, condCol(parts.tires));
}
