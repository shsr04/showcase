// Note: plays a storyboard scene (items 373, 374, 394, 396): each panel fills the frame and replaces the one before, moves on with Next (or Space, Enter, →) or by itself after AUTO_NEXT_MS, and Escape skips to the next choice or ends the scene.

import { paintPixelPanel, PW, PH } from './pixel-panels.js';
import { animateVignette, MARK_WORD, VW, VH } from './vignette.js';

// Note: user direction: a panel that waits for Next moves on by itself after this long; a choice and the last panel still wait.
export const AUTO_NEXT_MS = 10000;

// Note: the names of the scenes for the hidden heading a screen reader lands on.
const TITLES = {
  opening: 'The murder', succession: 'The swearing in', deputy: 'A new deputy', arrival: 'Arrival', lead: 'A lead', challenge: 'A challenge',
  outcome: 'After the duel', 'brawl-open': 'A saloon fight', 'brawl-after': 'After the fight', 'crew-death': 'In memory', 'sheriff-death': 'In memory of the sheriff', win: 'Revenge', fail: 'The trail goes cold',
};


// Note: the words of a panel for a screen reader: its caption and the cast with their marks and traits.
const panelText = (p) => [p.caption, p.cast.map((c) => [c.name, c.mark && MARK_WORD[c.mark], c.role, c.traits && c.traits.join(', ')].filter(Boolean).join(', ')).join('; ')].filter(Boolean).join(' ');

// Note: deps: h builds elements, modal shows the card, cue plays a sound, say voices a line, hush stops what is playing; onChoice(kind, value) answers a choice panel and resolves true to go on.
export function playScene(scene, deps) {
  const { h, modal, cue, say, hush, onChoice = async () => true, choices = {} } = deps;
  const panels = scene.panels;
  let at = -1;
  let timers = [];
  let frame = null;
  let pips = null;
  let nextBtn = null;
  let goBtn = null;
  let live = null;
  let busy = false;
  let closeFn = null;
  let result = { skipped: false, choice: null, stopped: false };
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t?.unref?.();
    timers.push(t);
  };

  // Note: item 396: the panel is one picture; the scene, the likenesses, the lettering and the cue pictures are all drawn on its canvas.
  function build(p, i) {
    const base = h('canvas', { width: PW, height: PH });
    const bctx = base.getContext && base.getContext('2d');
    if (bctx) paintPixelPanel(bctx, p.setting, { ...p.art, seed: `${scene.kind}:${p.id}` });
    const cv = h('canvas', { width: VW, height: VH, class: 'c-sart', role: 'img', 'aria-label': panelText(p) });
    const ctx = cv.getContext && cv.getContext('2d');
    if (ctx && bctx) animateVignette(cv, ctx, base, p);
    // Note: an automatic choice (a teammate answering on his own) shows no buttons; Next, or the wait of AUTO_NEXT_MS, answers it.
    const choice = p.choice && Array.isArray(choices[p.choice]) ? h('div', { class: 'c-schoice' }, ...choices[p.choice].map((c) => {
      const b = h('button', { type: 'button', class: 'btn small', 'data-key': `choice-${c.value}` }, c.label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        choose(c.value);
      });
      return b;
    })) : null;
    if (choice && p.then) choice.hidden = true;
    return h('div', { class: `c-spanel is-${p.setting} at-${p.id}`, 'data-panel': p.id, 'data-index': String(i) }, h('div', { class: 'c-sart-wrap' }, cv), choice);
  }

  function show(i) {
    clear();
    at = i;
    const p = panels[i];
    const el = build(p, i);
    const old = [...frame.querySelectorAll('.c-spanel')];
    for (const o of old) {
      o.classList.add('is-leaving');
      setTimeout(() => o.remove(), 700)?.unref?.();
    }
    frame.append(el);
    pips.forEach((pip, k) => pip.classList.toggle('is-on', k <= i));
    live.textContent = panelText(p);
    for (const [name, ms] of p.cues) later(() => cue(name), ms);
    for (const line of [p.say, p.then]) if (line) later(() => say(line.text, line.role || 'sheriff', line.id || 0), line.at || 0);
    const last = i === panels.length - 1;
    goBtn.hidden = !last || !!p.choice;
    nextBtn.hidden = (last && !p.choice) || (!!p.choice && !auto(p));
    if (p.choice && !auto(p)) {
      // Note: item 395 offers the choice after the reply has been voiced.
      const offered = p.then ? p.then.at + 900 + 65 * Math.min(40, p.then.text.length) : 50;
      later(() => {
        const box = el.querySelector('.c-schoice');
        if (box) box.hidden = false;
        box?.querySelector('button')?.focus({ preventScroll: true });
      }, offered);
      return;
    }
    if (last && !p.choice) {
      goBtn.setAttribute('aria-disabled', 'true');
      later(() => {
        goBtn.removeAttribute('aria-disabled');
        goBtn.focus({ preventScroll: true });
      }, Math.min(1400, p.hold));
      return;
    }
    later(() => next(), AUTO_NEXT_MS);
  }

  const auto = (p) => choices[p.choice] === 'auto';

  // Note: Next, or a key, moves to the next panel; a choice or the last panel waits, but an automatic choice is answered at once.
  function next() {
    if (busy || at < 0) return;
    const p = panels[at];
    if (p.choice && auto(p)) { choose('auto'); return; }
    if (p.choice || at === panels.length - 1) return;
    show(at + 1);
  }

  // Note: Escape stops the sound and goes to the next choice panel, or ends the scene (item 394).
  function skip() {
    if (busy) return;
    const p = panels[at];
    if (p && p.choice && auto(p)) { choose('auto'); return; }
    if (p && p.choice) return;
    hush();
    result.skipped = true;
    const to = panels.findIndex((q, k) => k > at && q.choice);
    if (to >= 0) show(to);
    else finish();
  }

  async function choose(value) {
    if (busy) return;
    busy = true;
    hush();
    result.choice = value;
    let go = false;
    try {
      go = await onChoice(panels[at].choice, value);
    } finally {
      busy = false;
    }
    if (!go) {
      result.stopped = true;
      finish();
      return;
    }
    if (at === panels.length - 1) finish();
    else show(at + 1);
  }

  function finish() {
    clear();
    closeFn?.(true);
  }

  return modal((close) => {
    closeFn = close;
    // Note: user direction: a click on the picture does nothing; only Next moves on.
    frame = h('div', { class: 'c-sframe-box', tabindex: '-1' });
    pips = panels.map(() => h('i', { class: 'c-spip' }));
    nextBtn = h('button', { type: 'button', class: 'btn small ghost c-snext', 'data-key': 'story-next' }, 'Next ▸');
    nextBtn.addEventListener('click', next);
    goBtn = h('button', { type: 'button', class: 'btn primary c-sgo', 'data-key': 'story-continue', autofocus: true }, 'Continue');
    goBtn.addEventListener('click', () => {
      if (goBtn.getAttribute('aria-disabled') !== 'true') finish();
    });
    goBtn.press = () => (goBtn.hidden ? skip() : goBtn.click());
    live = h('p', { class: 'c-slive', 'aria-live': 'polite' });
    return h('div', { class: `c-dlg c-vig c-story is-${scene.kind}${scene.full === false ? ' is-key' : ''}`, 'data-scene': scene.kind },
      h('h2', { class: 'c-sr', id: 'campDialogH', tabindex: '-1' }, TITLES[scene.kind] || 'A scene'),
      frame,
      h('div', { class: 'c-sbar' }, h('div', { class: 'c-spips', 'aria-hidden': 'true' }, ...pips), live, nextBtn, goBtn));
  }, {
    cls: 'is-story',
    cue: 'none',
    silent: true,
    esc: () => skip(),
    after: (body) => {
      body.addEventListener('keydown', (e) => {
        if (e.target.closest && e.target.closest('button')) return;
        if ([' ', 'ArrowRight', 'Enter'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (at === panels.length - 1 && !panels[at].choice) goBtn.click();
          else next();
        }
      });
      show(0);
      frame.focus({ preventScroll: true });
    },
  }).then(() => {
    clear();
    return result;
  });
}
