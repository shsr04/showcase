// Note: the markup of every duel screen as plain DOM builders; none of them touches a sim, a campaign or a timer, so each can be built and read in a test with a bare document.
import { DUEL_ROOT, injectDuelStyle } from './duel-style.js';
import { controlRows } from './duel-keys.js';

// Note: one element; class goes through className, hidden through its property, everything else through attributes, and a null or false value is skipped.
export function node(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'hidden') e.hidden = true;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
}

// Note: a brass plaque of the campaign (.btn); the press sound and the focus ring come from the campaign's own rules, the label and the aria-label from the caller.
export function button(label, run, o = {}) {
  const b = node('button', {
    type: 'button',
    class: `btn small${o.cls ? ` ${o.cls}` : ''}`,
    'data-key': o.key,
    'aria-label': o.aria,
    autofocus: o.autofocus,
  }, label);
  b.addEventListener('click', run);
  return b;
}

// Note: the root of every duel screen; making one puts the style sheet in the page.
export const root = (cls, phase, label) => {
  injectDuelStyle();
  return node('section', { class: `${DUEL_ROOT}${cls ? ` ${cls}` : ''}`, 'data-phase': phase, 'aria-label': label });
};

const fact = (term, text) => [node('dt', {}, term), node('dd', {}, text)];
const poster = (kicker, ...kids) => node('article', { class: 'duel-poster' }, node('p', { class: 'duel-kicker' }, kicker), ...kids);
const answer = (heading, ...kids) => node('div', { class: 'duel-answer' }, node('h3', { class: 'duel-answer-h' }, heading), ...kids);

// Note: the controls of the duel as a table, read from the keymap: what each action is, the mouse for it, the key and the key for the other hand.
export function controlsTable(watch = false, final = false) {
  const rows = controlRows(watch, final);
  return node('table', { class: 'duel-controls' },
    node('caption', {}, 'Controls'),
    node('thead', {}, node('tr', {}, node('th', { scope: 'col' }, 'Action'), node('th', { scope: 'col' }, 'Mouse'), node('th', { scope: 'col' }, 'Key'), node('th', { scope: 'col' }, 'Or'))),
    node('tbody', {}, rows.map((r) => node('tr', {},
      node('th', { scope: 'row' }, r.label),
      node('td', {}, r.mouse),
      node('td', {}, r.key ? node('kbd', {}, r.key) : ''),
      node('td', {}, r.mirror ? node('kbd', {}, r.mirror) : '')))));
}

// Note: the challenge as a wanted poster on the left and the answer on a wooden board on the right; the buttons are the persuasion.
export function challengeScreen(c, { onAnswer }) {
  const opp = c.opponent;
  const el = root('is-poster', 'challenge', 'A challenge');
  el.append(
    poster('A challenge',
      node('h2', { class: 'duel-name' }, opp.name),
      node('p', { class: 'duel-against' }, `challenges ${c.name} after a dispute over ${c.dispute}.`),
      node('hr', { class: 'duel-rule' }),
      node('p', { class: 'duel-quote' }, `“${opp.line}”`),
      node('dl', { class: 'duel-facts' },
        fact('Threat', c.threatened ? 'has made a threat' : 'has made no threat'),
        fact('Ground', `${c.venue}, ${c.distance} metres apart`),
        opp.met ? fact('Past', 'you have met before') : null)),
    answer('Your answer',
      node('p', { class: 'duel-lead' }, 'Try to talk the gunslinger out of it.'),
      node('div', { class: 'duel-buttons' },
        button('Intimidate', () => onAnswer('intimidate'), { aria: `Intimidate ${opp.name}` }),
        button('Explain', () => onAnswer('explain'), { aria: `Explain yourself to ${opp.name}` }))));
  return el;
}

// Note: the two stand-ins of the pace count: the sheriff's dot, the dotted lane and the stranger's dot.
const lane = () => node('div', { class: 'duel-lane', 'aria-hidden': 'true' }, node('b'), node('i'), node('b', { class: 'is-foe' }));

// Note: the moment before the exchange; the sentence is the campaign's own, the button begins it.
export function readyScreen(c, { onBegin }) {
  const el = root('is-poster', 'ready', 'Outside');
  el.append(
    poster('Outside',
      node('h2', { class: 'duel-name' }, c.name),
      node('p', { class: 'duel-against' }, 'against'),
      node('h2', { class: 'duel-name' }, c.opponent.name),
      lane(),
      node('dl', { class: 'duel-facts' },
        fact('Ground', c.venue),
        fact('Distance', `${c.distance} metres apart`))),
    answer('Your place',
      node('p', { class: 'duel-lead' }, c.watch
        ? `${c.opponent.name} insists on the fight with ${c.name}. You watch from the edge; they fight it out on their own.`
        : c.final ? `${c.opponent.name} will neither give up nor run. One of you dies here. Escape opens the menu.` : `${c.opponent.name} insists on the fight. Escape opens the menu.`),
      controlsTable(!!c.watch, !!c.final),
      node('div', { class: 'duel-buttons' },
        button(c.watch ? 'Go and watch' : 'Take your place', onBegin, { cls: 'danger', key: 'duel-begin' }))));
  return el;
}

// Note: a quarrel two others took outside, offered to the sheriff: watch or stay at the bar.
export function offerScreen(sp, { onWatch, onIgnore }) {
  const el = root('is-poster', 'offer', 'A quarrel');
  el.append(
    poster('A quarrel',
      node('h2', { class: 'duel-name' }, sp.a.name),
      node('p', { class: 'duel-against' }, 'and'),
      node('h2', { class: 'duel-name' }, sp.b.name),
      node('hr', { class: 'duel-rule' }),
      node('p', { class: 'duel-quote' }, sp.text)),
    answer('Step outside?',
      node('div', { class: 'duel-buttons' },
        button('Go and watch', onWatch, { key: 'spectate-watch' }),
        button('Stay at the bar', onIgnore, { cls: 'ghost', key: 'spectate-ignore' }))));
  return el;
}

// Note: the exchange takes over the window: the root holds the fitted view, the sheet that closes it, the menu, and two lines for a screen reader; nothing else is on it.
export function liveScreen({ view, watch = false }) {
  const el = root(`is-exchange${watch ? ' is-watch' : ''}`, 'exchange', 'The duel');
  const result = node('div', { class: 'duel-result', role: 'status' });
  const status = node('p', { class: 'duel-sr', role: 'status' });
  const shot = node('p', { class: 'duel-sr', role: 'status' });
  el.append(view, result, status, shot);
  return { el, result, status, shot };
}

// Note: items 356, 357, 359: the choice over a fallen opponent, Finish him or (in an ordinary duel) Walk away, each with its key; it stays hidden until the opponent is down.
export function finishChoice({ final, finishKey, stopKey, act }) {
  const say = node('p', { class: 'duel-choice-say', role: 'status' });
  const el = node('div', { class: 'duel-choice', role: 'group', 'aria-label': 'He is down', hidden: true },
    node('p', { class: 'duel-choice-h' }, 'He is down'),
    node('div', { class: 'duel-buttons' },
      button(`Finish him (${finishKey})`, () => act('finish'), { cls: 'danger', key: 'duel-finish' }),
      final ? null : button(`Walk away (${stopKey})`, () => act('stop'), { cls: 'primary', key: 'duel-walk' })),
    say);
  return { el, say };
}

// Note: what stands in the campaign's own screen while the exchange has the window; it is covered, and a screen reader is told where the duel is.
export function awayScreen() {
  const el = root('is-away', 'away', 'The exchange');
  el.append(node('p', {}, 'The exchange is under way.'));
  return el;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Note: the sheet laid over the stage when the exchange is over: a stamp, the words, and what each side did.
export function sheetOf(result, buttons = []) {
  return node('div', { class: `duel-sheet is-${result.tone}`, role: 'group', 'aria-label': 'The result' },
    node('span', { class: 'duel-stamp' }, result.stamp),
    node('p', { class: 'duel-verdict' }, result.headline),
    node('ul', { class: 'duel-tally' }, result.sides.map((s) => node('li', {},
      node('b', {}, s.name), node('span', {}, s.fate), node('span', {}, `${plural(s.shots, 'shot', 'shots')}, ${plural(s.hits, 'hit', 'hits')}`)))),
    node('div', { class: 'duel-buttons' }, buttons));
}
