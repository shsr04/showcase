// Note: DOM overlay: sector readout, gauges, toasts, the typewriter log and the help card.

const HELP = [
  ['W A S D', 'thrust / strafe'],
  ['Mouse', 'look (click to capture)'],
  ['Space / C', 'rise / sink'],
  ['Q / E', 'bank'],
  ['Shift', 'boost'],
  ['X', 'brake'],
  ['F', 'headlamp'],
  ['G', 'throw glowstick'],
  ['V', 'sonar ping'],
  ['T', 'toggle drift'],
  ['M', 'sound on/off'],
  ['P', 'hide HUD'],
  ['Esc', 'pause'],
];

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');
    this.district = $('hudDistrict');
    this.sector = $('hudSector');
    this.mode = $('hudMode');
    this.speed = $('hudSpeed');
    this.pos = $('hudPos');
    this.logs = $('hudLogs');
    this.logsTotal = $('hudLogsTotal');
    this.toastEl = $('hudToast');
    this.logEl = $('hudLog');
    this.helpEl = $('hudHelp');
    this.reticle = $('hudReticle');
    this.toastT = 0;
    this.logT = 0;
    this.typed = 0;
    this.logTitle = '';
    this.logBody = '';
    this.visible = true;
    this.last = {};
    this.helpEl.innerHTML = HELP.map(([k, v]) => `<div><b>${k}</b> ${v}</div>`).join('');
  }

  show(on) {
    this.root.classList.toggle('is-hidden', !on);
  }

  setVisible(on) {
    this.visible = on;
    this.root.classList.toggle('is-faded', !on);
  }

  set(el, key, text) {
    if (this.last[key] === text) return;
    this.last[key] = text;
    el.textContent = text;
  }

  setPlace(district, sector) {
    this.set(this.district, 'district', district);
    this.set(this.sector, 'sector', sector);
  }

  setMode(text) {
    this.set(this.mode, 'mode', text);
  }

  setSpeed(v) {
    this.set(this.speed, 'speed', v.toFixed(1));
  }

  setPos(p) {
    this.set(this.pos, 'pos', `${Math.round(p[0])} ${Math.round(p[1])} ${Math.round(p[2])}`);
  }

  setLogs(n, total) {
    this.set(this.logs, 'logs', String(n));
    this.set(this.logsTotal, 'logsTotal', total ? `/${total}` : '');
  }

  toast(text, secs = 3.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('is-on');
    this.toastT = secs;
  }

  // Note: a log entry types itself out at the bottom left and fades after a while.
  log(title, body, secs = 11) {
    this.logTitle = title;
    this.logBody = body;
    this.typed = 0;
    this.logT = secs + body.length / 40;
    this.logEl.classList.add('is-on');
    this.renderLog();
  }

  renderLog() {
    const n = Math.floor(this.typed);
    const full = this.logTitle.length;
    const t = this.logTitle.slice(0, n);
    const b = n > full ? this.logBody.slice(0, n - full) : '';
    this.logEl.textContent = '';
    const bold = document.createElement('b');
    bold.textContent = t;
    this.logEl.appendChild(bold);
    this.logEl.appendChild(document.createTextNode(b ? `\n${b}` : ''));
  }

  toggleHelp() {
    this.helpEl.classList.toggle('is-on');
  }

  update(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('is-on');
    }
    if (this.logT > 0) {
      const total = this.logTitle.length + this.logBody.length;
      if (this.typed < total) {
        this.typed = Math.min(total, this.typed + dt * 52);
        this.renderLog();
      }
      this.logT -= dt;
      if (this.logT <= 0) this.logEl.classList.remove('is-on');
    }
  }
}
