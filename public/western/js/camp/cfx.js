// Note: overlays and motion of the campaign stage; nothing here knows the campaign, and nothing here changes the size or place of a region.

export const STAGE_W = 1280;
export const STAGE_H = 720;
// Note: every animation below is finite; none loops.
export const MAX_MS = 2400;

export function reducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Note: one uniform scale, letterboxed; the design size never changes, only the factor.
export function stageScale(w, h) {
  return Math.max(0.25, Math.min(w / STAGE_W, h / STAGE_H));
}

export function fitStage(stage) {
  const fit = () => stage.style.setProperty('--cs', String(stageScale(window.innerWidth || STAGE_W, window.innerHeight || STAGE_H)));
  fit();
  window.addEventListener('resize', fit);
  return () => window.removeEventListener('resize', fit);
}

// Note: a rect in design pixels, relative to the stage, from a client rect.
export function inStage(stage, r) {
  const s = stage.getBoundingClientRect();
  const k = s.width / STAGE_W || 1;
  return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Note: the status strip ends at this design y; a toast or a tip is never put above it.
export const BAR_BOTTOM = 106;

// Note: puts a box next to an anchor, above it when there is room below the status strip, and keeps it inside the stage; returns the side and where the tail points.
export function placeBox(box, anchor, gap = 12, top = BAR_BOTTOM) {
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  if (!anchor) {
    const x = 256 + (1012 - w) / 2;
    box.style.left = `${Math.round(x)}px`;
    box.style.top = '122px';
    box.style.setProperty('--tail', `${Math.round(w / 2)}px`);
    box.dataset.side = 'none';
    return;
  }
  const cx = anchor.x + anchor.w / 2;
  const above = anchor.y - h - gap >= top;
  const y = above ? anchor.y - h - gap : Math.min(STAGE_H - h - 6, anchor.y + anchor.h + gap);
  const x = clamp(cx - w / 2, 8, STAGE_W - w - 8);
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(y)}px`;
  box.style.setProperty('--tail', `${Math.round(clamp(cx - x, 16, w - 16))}px`);
  box.dataset.side = above ? 'above' : 'below';
}

const rectOf = (box) => ({ x: parseFloat(box.style.left) || 0, y: parseFloat(box.style.top) || 0, w: box.offsetWidth, h: box.offsetHeight });
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Note: hooks.sfx(name, opts) plays a cue; hooks.live(text) feeds the screen-reader region.
export function createFx(stage, hooks = {}) {
  const sfx = (n, o) => hooks.sfx && hooks.sfx(n, o);
  const layer = (id) => stage.querySelector(`#${id}`);
  const toasts = layer('campToasts');
  const tip = layer('campTip');
  const cere = layer('campCeremony');
  const active = new Set();
  let anchor = null;
  let toastTimer = 0;
  let tipTimer = 0;
  let tipFor = null;

  // Note: kind lets a click end a typewriter or a counter without ending a title card.
  const track = (finish, kind = 'anim') => {
    finish.kind = kind;
    active.add(finish);
    return () => active.delete(finish);
  };

  const fx = {
    get anchor() {
      return anchor;
    },
    set anchor(a) {
      anchor = a;
    },
    anchorOf: (node) => (node && node.getBoundingClientRect ? inStage(stage, node.getBoundingClientRect()) : null),
    busy: (kind) => [...active].some((f) => !kind || f.kind === kind),
    skip(...kinds) {
      for (const f of [...active]) if (!kinds.length || kinds.includes(f.kind)) f();
    },
  };

  // Note: a message batch shows next to the control that was pressed.
  fx.toast = (lines, at = anchor) => {
    const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!toasts || !list.length) return null;
    clearTimeout(toastTimer);
    toasts.replaceChildren();
    const box = el('div', 'c-toast');
    for (const l of list) box.append(el('p', null, l));
    const tail = el('i', 'c-tail');
    tail.setAttribute('aria-hidden', 'true');
    box.append(tail);
    toasts.append(box);
    placeBox(box, at);
    box.classList.add('is-in');
    const chars = list.join(' ').length;
    toastTimer = setTimeout(() => {
      box.classList.add('is-out');
      setTimeout(() => box.remove(), 160);
    }, Math.min(11000, 3600 + chars * 45));
    return box;
  };

  fx.clearToasts = () => {
    clearTimeout(toastTimer);
    if (toasts) toasts.replaceChildren();
  };

  // Note: tooltips are on [data-tip]; a disabled-looking button keeps its tip because it uses aria-disabled.
  fx.hideTip = () => {
    clearTimeout(tipTimer);
    tipFor = null;
    if (tip) tip.classList.remove('is-in');
  };

  const showTip = (node) => {
    if (!tip || !node.isConnected) return;
    const text = node.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    tip.classList.add('is-in');
    placeBox(tip, inStage(stage, node.getBoundingClientRect()), 8);
    const toast = toasts && toasts.querySelector('.c-toast:not(.is-out)');
    if (toast && overlaps(rectOf(tip), rectOf(toast))) {
      // Note: a live toast already says it, so the tip steps aside.
      tip.classList.remove('is-in');
      return;
    }
    tipFor = node;
  };

  stage.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || t === tipFor) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(t), tipFor ? 60 : 380);
  });
  stage.addEventListener('pointerout', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && !t.contains(e.relatedTarget)) fx.hideTip();
  });
  stage.addEventListener('focusin', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && t.matches(':focus-visible')) showTip(t);
  });
  stage.addEventListener('focusout', () => fx.hideTip());
  stage.addEventListener('pointerdown', () => fx.hideTip(), true);
  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Shift' && e.key !== 'Tab') fx.hideTip();
  }, true);

  // Note: the pressed state is set on pointerdown, before the click.
  const PRESSABLE = '.btn, .c-tab, .c-dest, .c-place.is-pick, .c-sound, button';
  stage.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest(PRESSABLE);
    if (!b) return;
    anchor = inStage(stage, b.getBoundingClientRect());
    b.classList.add('is-down');
    const up = () => {
      b.classList.remove('is-down');
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }, true);
  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest && e.target.closest(PRESSABLE);
    if (b) anchor = inStage(stage, b.getBoundingClientRect());
  }, true);

  // Note: a stamp or a seal is thumped onto the screen; it is finite and pointer-transparent.
  const thump = (node, ms, cue) => new Promise((resolve) => {
    cere.append(node);
    sfx(cue);
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      forget();
      node.remove();
      resolve();
    };
    const forget = track(finish);
    timer = setTimeout(finish, ms);
  });

  fx.stamp = (text, at = anchor, cls = '') => {
    if (reducedMotion()) {
      sfx('stamp');
      return Promise.resolve();
    }
    const s = el('div', `c-stamp ${cls}`.trim(), text);
    s.style.left = `${Math.round(at ? at.x + at.w / 2 : 760)}px`;
    s.style.top = `${Math.round(at ? Math.max(150, at.y - 30) : 330)}px`;
    return thump(s, 1250, 'stamp');
  };

  // Note: kind is 'badge' for an appointed deputy, anything else is a wax seal.
  fx.seal = (kind, at = anchor) => {
    if (reducedMotion()) {
      sfx('seal');
      return Promise.resolve();
    }
    const s = el('div', `c-seal ${kind === 'badge' ? 'is-badge' : 'is-wax'}`);
    if (kind === 'badge') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#badge');
      svg.append(use);
      s.append(svg);
    } else s.append(el('b', null, '★'));
    s.style.left = `${Math.round(at ? at.x + at.w / 2 : 760)}px`;
    s.style.top = `${Math.round(at ? Math.max(140, at.y - 10) : 330)}px`;
    return thump(s, 1100, 'seal');
  };

  // Note: a full-stage title card; any key or click ends it early.
  fx.card = ({ lines, tone = 'morning', ms = 1700, cues = [] }) => {
    if (reducedMotion()) return Promise.resolve();
    return new Promise((resolve) => {
      const c = el('div', `c-titlecard tone-${tone}`);
      c.style.setProperty('--ms', `${Math.min(MAX_MS, ms)}ms`);
      lines.forEach((l, i) => {
        const p = el('p', l.cls || (i === 0 ? 'tc-big' : 'tc-small'), l.text);
        p.style.setProperty('--i', String(i));
        c.append(p);
      });
      cere.append(c);
      cues.forEach(([name, at]) => setTimeout(() => sfx(name), at));
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        forget();
        c.remove();
        resolve();
      };
      const forget = track(finish);
      timer = setTimeout(finish, Math.min(MAX_MS, ms));
      c.addEventListener('pointerdown', finish);
    });
  };

  // Note: the telegraph typewriter keeps the unrevealed text in place (hidden), so the paragraph never changes size.
  fx.typewrite = (node, text, { cps = 70 } = {}) => {
    node.textContent = '';
    if (reducedMotion() || !text) {
      node.textContent = text || '';
      return Promise.resolve();
    }
    const shown = document.createTextNode('');
    const rest = el('span', 'tw-rest', text);
    rest.setAttribute('aria-hidden', 'true');
    node.append(shown, rest);
    return new Promise((resolve) => {
      let n = 0;
      let timer = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        forget();
        node.textContent = text;
        resolve();
      };
      const forget = track(finish, 'type');
      const per = Math.max(1, Math.round(cps * 0.04));
      const tick = () => {
        if (!node.isConnected) {
          finish();
          return;
        }
        n = Math.min(text.length, n + per);
        shown.nodeValue = text.slice(0, n);
        rest.textContent = text.slice(n);
        if (n >= text.length) finish();
        else timer = setTimeout(tick, 40);
      };
      tick();
    });
  };

  fx.countUp = (node, from, to, format, ms = 420) => {
    node.textContent = format(to);
    if (reducedMotion() || from === to) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = performance.now();
      let raf = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        forget();
        node.textContent = format(to);
        resolve();
      };
      const forget = track(finish, 'count');
      const frame = (now) => {
        if (!node.isConnected) {
          finish();
          return;
        }
        const k = Math.min(1, (now - t0) / ms);
        const eased = 1 - (1 - k) * (1 - k);
        node.textContent = format(Math.round(from + (to - from) * eased));
        if (k >= 1) finish();
        else raf = requestAnimationFrame(frame);
      };
      node.textContent = format(from);
      raf = requestAnimationFrame(frame);
    });
  };

  // Note: a pause that a skip ends at once.
  fx.wait = (ms) => new Promise((resolve) => {
    let timer = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      forget();
      resolve();
    };
    const forget = track(finish);
    timer = setTimeout(finish, reducedMotion() ? 0 : ms);
  });

  // Note: a page turn fades and slides the body a few pixels; transform and opacity only.
  fx.turn = (node) => {
    if (reducedMotion()) return;
    node.classList.remove('is-turning');
    void node.offsetWidth;
    node.classList.add('is-turning');
  };

  return fx;
}
