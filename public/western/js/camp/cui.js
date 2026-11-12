// Note: the campaign interface; every campaign screen, dialog and string lives here, main.js only plays the tactical scene and hands the Sim back.

import { Campaign } from './campaign.js';
import { STATE_VERSION } from './state.js';
import { DuelSim } from './duel-sim.js';
import { mountDuel } from './duel-ui.js';
import { settledLine } from './duel-pose.js';
import { challengeScreen, offerScreen, readyScreen } from './duel-screens.js';
import { quickDuel } from './duel-quick.js';
import { BrawlSim } from './brawl-sim.js';
import { createBrawlView } from './brawl-view.js';
import { buildRoom } from './saloon-room.js';
import { SaloonScene } from './saloon-scene.js';
import { createSaloonView, moodOf } from './saloon-view.js';
import { buildSim, finishScene, withSide } from './scene.js';
import { research } from './view.js';
import { DRY_TODAY } from './intel.js';
import { dollars, isKnown } from './base.js';
import {
  dateOf, TERRAINS, PLACES, LODGING_CENTS_PER_DAY, PLACE_COUNT, routeTree,
} from './world.js';
import {
  mapFrame, knownIndex, pathPoints, legPoints, nearestKnown, uncertaintyNote,
} from './map-view.js';
import { pickerNav, previewPanel, previewFacts } from './travel-pick.js';
import { presentIn } from './town.js';
import { randomSeed } from '../rand.js';
import { terrainLabel } from '../regional-look.js';
import { createFx, fitStage } from './cfx.js';
import { createMenuSfx } from './menusfx.js';
import { portraitCanvas } from '../portrait.js';
import {
  REPEATS, staged, openingScene, successionScene, deputyScene, arrivalScene, leadScene, challengeScene, outcomeScene, brawlOpenScene, brawlAfterScene, crewDeathScene, sheriffDeathScene, winScene, failScene,
} from './storyboard.js';
import { playScene as playStory } from './storyplayer.js';
import {
  successionText, pairGrief, pickGrief, skipCrewForSheriff, ripText, listOf,
} from './mourning.js';
import { WEAPONS, CARTRIDGES, BASE_AMMO } from '../weapons.js';
import { earnIronman, dynamiteSticks, showHonours } from '../honours.js';
import { DYNAMITE } from '../dynamite.js';

const SAVE_KEY = 'ws.campaign.v1';
const $ = (id) => document.getElementById(id);

// Note: every call that can change the campaign; the save is written after each of them, so a save written between team selection and the report holds the open encounter.
const MUTATING = new Set([
  'readNotices', 'askAround', 'askAbout', 'contactReport', 'seekLead', 'faceNemesis', 'accept', 'abandon', 'buy', 'sell', 'treat', 'recruit', 'dismiss', 'rest', 'carry', 'enterSaloon', 'leaveSaloon', 'saloonActivity',
  'duelPersuade', 'duelBegin', 'duelFinish', 'spectateWatch', 'spectateIgnore', 'spectateFinish', 'brawlChoose', 'brawlStayOut', 'brawlFinish',
  'depart', 'advance', 'restOnRoad', 'turnBack', 'redirect', 'choose', 'withdraw', 'engage', 'encounterSpec', 'cancelEncounter',
]);

const S = {
  app: null,
  camp: null,
  view: null,
  screen: 'town',
  tab: 'board',
  tabs: [],
  dest: null,
  prep: null,
  trail: [],
  auto: false,
  timer: 0,
  flash: [],
  history: [],
  names: {},
  qty: {},
  offers: {},
  shopWho: null,
  busy: false,
  modal: false,
  modalClose: null,
  warned: false,
  focus: 'head',
  refocus: null,
  seen: new Set(),
  typeQueue: [],
  grief: [],
  holdGrief: false,
  cents: null,
  warnText: '',
  departures: 0,
  sceneOn: false,
  endShown: false,
  sheet: null,
  saloon: null,
  saloonPatron: null,
  duelSim: null,
  duelUi: null,
  spectSim: null,
  spectUi: null,
  brawlSim: null,
  brawl: null,
};

// Note: no storage outside a browser, so the module can be imported by node tests without touching a missing localStorage.
const sfx = createMenuSfx(undefined, { storage: typeof window === 'undefined' ? null : undefined });
let fx = null;

// Note: menu cues are for the campaign screens only; a tactical scene has its own sound.
const cue = (name, o) => {
  if (!S.sceneOn) sfx.play(name, o);
};

// Note: item 448: the draw-last warp slows the tune and the cues while it runs; speed 1 restores both.
const duelWarp = (speed, quiet) => {
  S.app?.music?.setRate?.(0.5 + 0.5 * speed);
  sfx.setWarp(speed, { quiet });
};

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k);
  return e;
}

const NS = 'http://www.w3.org/2000/svg';
function sv(tag, props, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k);
  return e;
}

function deny(why) {
  cue('deny');
  if (why) fx.toast(why);
}

// Note: a brass plaque; a control that cannot be used keeps the pointer and the focus (aria-disabled) so its tooltip and bubble can say why.
function control(label, onclick, o, small) {
  const off = !!o.disabled;
  const b = h('button', {
    type: 'button',
    class: `btn${small ? ' small' : ''}${o.cls ? ` ${o.cls}` : ''}`,
    'data-key': o.key,
    'data-sfx': o.sfx,
    'data-tip': o.tip || (off ? o.why || 'Not available right now.' : null),
    'aria-label': o.aria,
    'aria-pressed': o.pressed,
    'aria-disabled': off ? 'true' : null,
    autofocus: o.autofocus,
  }, label);
  b.addEventListener('click', (e) => {
    if (off) {
      deny(o.why);
      return;
    }
    onclick(e);
  });
  return b;
}

const btn = (label, onclick, o = {}) => control(label, onclick, o, true);
const bigBtn = (label, onclick, o = {}) => control(label, onclick, o, false);

// Note: every screen names a cartridge and a weapon by its roster name (items 361–368).
const AMMO_NAME = Object.fromEntries(Object.entries(CARTRIDGES).map(([id, c]) => [id, c.name]));
const WEAPON_NAME = Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, w.name]));
const weaponText = (w) => `${WEAPON_NAME[w.id] || w.id} (${AMMO_NAME[w.ammoType] || w.ammoType})`;
const hoursText = (n) => (n < 1 ? `${Math.round(n * 60)} min` : n < 20 ? `${Math.round(n * 10) / 10} h` : `${Math.round(n)} h`);
// Note: the date cut in a grave marker.
const markOf = (min) => { const d = dateOf(min); return `${d.day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}`; };
const stampOf = (min) => {
  const d = dateOf(min);
  return `${d.label.slice(0, 3)} ${d.time}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Note: small counts in running text are written out.
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const counted = (n, one, many) => `${NUM_WORD[n] || n} ${n === 1 ? one : many}`;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Note: the sim's short reasons read as a sentence.
const REASON = { cleared: 'Every hostile is down or out of the fight.' };
const sentence = (s) => REASON[s] || (s ? `${cap1(s)}${/[.!?]$/.test(s) ? '' : '.'}` : '');

const COND_CLASS = {
  sound: 'good', 'bruised and mending': 'good', hurt: 'down', 'badly hurt': 'down', 'laid up': 'dead',
};

// Note: the label carries the title ('Sheriff Edgar Pickett'), the display name the nickname; both fall back to the plain name.
const labelOf = (c) => (c && (c.label || c.display || c.name)) || 'Someone';
const displayOf = (c) => (c && (c.display || c.name)) || 'Someone';
const nameOf = (id) => S.names[id] || 'Someone';
const placeName = (id) => (PLACES[id] ? PLACES[id].name : 'A place');

// Note: items 142, 172: a stop on a route is named only when it is on the map; anything else reads as an unknown stop.
export function viaText(via, known) {
  const names = new Set(known || []);
  const out = [];
  for (const x of via || []) {
    const t = names.has(x) ? x : 'an unknown stop';
    if (t === 'an unknown stop' && out[out.length - 1] === t) continue;
    out.push(t);
  }
  return out.join(', ');
}

// Note: wage and leave messages come from events (items 152, 167); a death is shown by its own black-bordered card.
function eventText(ev) {
  switch (ev.type) {
    case 'death': return null;
    case 'succession': return ev.kind === 'ended' ? null : successionText(ev);
    case 'board-unpaid': return 'There is no money for board and lodging.';
    case 'discovered': return `${placeName(ev.placeId)} is now on your map.`;
    case 'spring': return 'The party refills its water at a spring.';
    case 'shortage': return ev.text;
    case 'wage': return `${nameOf(ev.charId)} is paid ${dollars(ev.cents)} in wages.`;
    case 'unpaid': return `${nameOf(ev.charId)} goes unpaid.`;
    case 'left': return `${ev.name} ${ev.why}.`;
    case 'captured': return `${ev.name} ${ev.how === 'surrender' ? 'gives himself up' : 'is restrained where he fell'} and is questioned.`;
    case 'avoided': return ev.text;
    case 'trait': return ev.text;
    case 'reward': return `${ev.title}. ${ev.text}`;
    case 'associate-dead': return ev.recovery === 'body' ? `${ev.name} is dead; the office searches the body.` : `${ev.name} is dead. Ask around in ${placeName(ev.at)}: ${ev.recovery === 'belongings' ? 'his belongings' : 'people who knew him'} may tell what he knew.`;
    case 'expired': {
      if (!ev.accepted) return null;
      const c = S.camp.case(ev.caseId);
      return `The case "${c ? c.title : 'an old case'}" has run out of time.`;
    }
    default: return null;
  }
}

const say = (text) => {
  if (text) S.flash.push(text);
};

function news(events, skip = []) {
  for (const ev of events || []) {
    if (skip.includes(ev.type) || !eventText(ev)) continue;
    say(eventText(ev));
    S.news = true;
  }
}

// Note: the messages of one action leave as one bubble next to the control that was pressed; the journal keeps the last of them.
function notify() {
  if (!S.flash.length || S.modal || S.sceneOn) return;
  const lines = S.flash.splice(0);
  const min = S.view ? S.view.time.min : 0;
  for (const text of lines) S.history.push({ min, text });
  if (S.history.length > 40) S.history.splice(0, S.history.length - 40);
  $('campLive').textContent = lines.join(' ');
  fx.toast(lines);
  // Note: item 328: news comes in on the telegraph key; a refusal or a plain note does not.
  if (S.news) cue('key');
  S.news = false;
}

const store = {
  read() {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  },
  write(text) {
    try {
      localStorage.setItem(SAVE_KEY, text);
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Note: blocked storage only means there is nothing to remove.
    }
  },
};

function persist() {
  if (!S.camp) return;
  // Note: an ended campaign is never saved again, so Continue cannot lead back to its closing screen.
  if (S.camp.state.ended) {
    store.clear();
    return;
  }
  const text = S.camp.save();
  // Note: item 498: Retry returns to the last save outside a scene, so a lost fight is played again from before it began.
  if (!S.camp.state.active) S.checkpoint = text;
  if (!store.write(text) && !S.warned) {
    S.warned = true;
    say('Progress cannot be saved in this browser; the campaign lasts until the page is closed.');
  }
}

// Note: every campaign call goes through here, so the autosave, the event messages and the mourning cannot be forgotten.
function call(method, ...args) {
  const res = S.camp[method](...args);
  if (MUTATING.has(method)) persist();
  if (res && res.events) {
    news(res.events);
    grieve(res.events.filter((e) => e.type === 'death'), res.events);
    beats(res.events);
  }
  return res;
}

function V() {
  const v = S.camp.view();
  // Note: item 328: a bell when a new day dawns.
  if (S.view && S.view.seed === v.seed && v.time.dayIndex > S.view.time.dayIndex && !v.ended) cue('bell');
  S.view = v;
  for (const c of v.crew) S.names[c.id] = labelOf(c);
  return v;
}

// Note: a save written between team selection and the report holds an open encounter; closing the tab mid-scene counts as pulling out, through the same report as the Pull out button, never as a free retry of the same seed.
export function settleUnfinished(camp) {
  const act = camp.state && camp.state.active;
  if (!act) return null;
  // Note: item 498: leaving a running fight undoes its wounds and deaths like a Retry does, so it costs the Ironman status too.
  camp.state.ironman = false;
  const source = act.source === 'case' ? act.caseId : { id: act.encId };
  const spec = camp.encounterSpec(source, act.teamIds.slice(1));
  if (!spec.ok) {
    camp.cancelEncounter();
    return { ok: false, reason: spec.reason };
  }
  let sim;
  try {
    sim = buildSim(spec);
  } catch {
    camp.cancelEncounter();
    return { ok: false, reason: 'The scene could not be laid out again.' };
  }
  const res = finishScene(camp, sim, spec, { result: 'failure', reason: 'the party pulled out' });
  if (camp.state.active) camp.cancelEncounter();
  return res;
}

const REGIONS = ['campBar', 'campNav', 'campMain', 'campFoot', 'campSound'];
let modalChain = Promise.resolve();

// Note: questions queue; one card at a time, Esc and the backdrop-free card close it with no answer, Tab stays inside it.
function modal(build, o = {}) {
  const run = () => new Promise((resolve) => {
    const dlg = $('campDialog');
    const body = $('campDialogBody');
    const card = dlg.querySelector('.c-modal-card');
    stopAuto();
    fx.hideTip();
    fx.clearToasts();
    S.modal = true;
    card.className = `c-modal-card${o.cls ? ` ${o.cls}` : ''}`;
    const opener = document.activeElement;
    let closed = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const onkey = (e) => {
      if (e.key === 'Enter' && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(e.target.tagName)) {
        const d = body.querySelector('[autofocus]') || body.querySelector('.btn.primary');
        if (d) {
          e.preventDefault();
          d.click();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const f = [...dlg.querySelectorAll('button:not([aria-disabled="true"]), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
      e.preventDefault();
      f[next].focus();
    };
    const close = (value) => {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      dlg.removeEventListener('keydown', onkey);
      dlg.classList.add('is-hidden');
      for (const id of REGIONS) $(id).inert = false;
      S.modal = false;
      S.modalClose = null;
      if (!o.silent) cue('close');
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      resolve(value === undefined ? true : value);
    };
    // Note: Escape passes null; a card with its own Escape handler takes it, while a forced close with a value still closes.
    S.modalClose = o.esc ? (v) => (v === null ? o.esc() : close(v)) : close;
    body.replaceChildren(build(close));
    for (const id of REGIONS) $(id).inert = true;
    dlg.classList.remove('is-hidden');
    dlg.addEventListener('keydown', onkey);
    cue(o.cue || 'open');
    const first = body.querySelector('[autofocus]') || body.querySelector('h2');
    if (first) first.focus({ preventScroll: true });
    const scroller = body.querySelector('.c-dlg');
    if (scroller) scroller.scrollTop = 0;
    if (o.after) o.after(body, close, later);
  });
  const p = modalChain.then(run);
  modalChain = p.then(() => {}, () => {});
  return p;
}

function dialogHead(title, kicker) {
  return [
    kicker ? h('p', { class: 'banner' }, kicker) : null,
    h('h2', { class: 'c-title', id: 'campDialogH', tabindex: '-1' }, title),
  ];
}

function info(title, lines, label = 'Close', kicker = null, o = {}) {
  return modal((close) => h('div', { class: 'c-dlg' },
    dialogHead(title, kicker),
    lines.map((l) => (typeof l === 'string' ? h('p', { class: 'c-text' }, l) : l)),
    h('div', { class: 'actions' }, bigBtn(label, () => close(true), { cls: 'primary', autofocus: true }))), o);
}

function confirm(title, lines, yes, no = 'Never mind', danger = false) {
  return modal((close) => h('div', { class: 'c-dlg' },
    dialogHead(title),
    lines.map((l) => h('p', { class: 'c-text' }, l)),
    h('div', { class: 'actions' },
      bigBtn(yes, () => close(true), { cls: danger ? 'danger' : 'primary' }),
      bigBtn(no, () => close(false), { cls: 'ghost', autofocus: true })))).then((v) => v === true);
}

// Note: the map is the continental canvas of map-view.js; this hands it the party, the chosen way, the journey and the trail, and gets the same figure back on every draw.
function worldMap(key, v, o = {}) {
  const j = v.journey;
  return mapFrame(key, {
    index: knownIndex(S.camp),
    party: v.map.party,
    here: v.at,
    // Note: the places where the office's own accepted cases wait; offers are never marked (item 174).
    // Note: item 491: a case not yet located is pinned at its lead's town.
    cases: [...new Set(v.accepted.flatMap((c) => (c.location.known ? [c.location.id] : c.lead && c.lead.known ? [c.lead.town] : [])))],
    // Note: the places the hunt's leads name carry the associate's or the nemesis's mark.
    hunt: v.story ? v.story.trail : [],
    selected: o.selected,
    pick: o.pick,
    plan: o.plan,
    route: o.route,
    trail: o.trail,
    reveal: o.reveal,
    fit: o.fit,
    follow: !!j,
    anchor: j ? `journey:${j.from}>${j.to}:${j.startedMin}` : `at:${v.at}`,
  });
}

function stat(label, main, sub, o = {}) {
  return h('div', { class: 'c-stat' }, h('dt', {}, label, o.extra || null), h('dd', {}, h('b', { id: o.id }, main), sub ? h('small', {}, sub) : null));
}

// Note: stores are kept in fractions; the bar shows one decimal at most.
const tenth = (n) => String(Math.round(n * 10) / 10);
// Note: the largest tenth that is not more than the stock; a bring field never asks for more than is there.
const below = (n) => Math.floor(n * 10 + 1e-6) / 10;

// Note: the strip has a fixed height; a warning is a small chip with a tooltip, never a new line.
function renderBar(v) {
  const st = v.supplies.stock;
  const cap = v.supplies.capacity;
  const w = v.time.weather;
  const bar = $('campBar');
  const crew = h('ul', { class: 'c-crewchips', 'aria-label': 'Crew condition' });
  for (const c of v.crew) {
    const away = c.where !== 'party' && c.where !== v.at;
    const state = `${c.condition}${c.fatigue === 'rested' ? '' : `, ${c.fatigue}`}${c.drink ? `, ${c.drink}` : ''}${away ? `, in ${c.whereName}` : ''}`;
    crew.append(h('li', { class: `c-cchip ${COND_CLASS[c.condition] || 'down'}`, 'data-tip': `${labelOf(c)}: ${state}` },
      h('b', {}, displayOf(c)), h('small', {}, state)));
  }
  const text = v.supplies.warnings.join(' ');
  const warn = text ? h('span', { class: 'c-warn', tabindex: '0', 'data-tip': text, 'aria-label': `Warning: ${text}` }, 'Low') : null;
  bar.replaceChildren(
    h('dl', { class: 'c-stats' },
      stat('When', `${v.time.label}, ${v.time.time}`, `${v.time.daylight ? 'Day' : 'Night'} · ${w.label}, high ${w.highF}°F`),
      stat('Purse', v.money.text, `Standing: ${v.reputation.sheriff}`, { id: 'campPurse' }),
      stat('Stores', `food ${tenth(st.food)}/${cap.food} · water ${tenth(st.water)}/${cap.water} L · feed ${tenth(st.feed)}/${cap.feed}`,
        Object.entries(v.ammo).filter(([t, n]) => n > 0 || BASE_AMMO.includes(t)).map(([t, n]) => `${AMMO_NAME[t] || t} ×${n}`).join(' · '), { extra: warn }),
      stat('Travelling', cap1(v.transport.name), v.crew.length > 1 ? `Crew: ${v.reputation.team}` : 'Riding alone')),
    crew);
  if (text !== S.warnText) {
    if (text) say(text);
    S.warnText = text;
  }
  // Note: coins count up to the new purse, and the till knocks once.
  const from = S.cents == null ? v.money.cents : S.cents;
  S.cents = v.money.cents;
  if (from !== v.money.cents) {
    cue(v.money.cents > from ? 'coin' : 'purchase');
    fx.countUp($('campPurse'), from, v.money.cents, dollars);
  }
}

const panelHead = (title) => h('h2', { class: 'c-sub', id: 'campPanelH', tabindex: '-1' }, title);
const hint = (text) => h('p', { class: 'c-hint' }, text);

function facts(rows) {
  const dl = h('dl', { class: 'c-facts' });
  for (const row of rows) if (row && row[1] != null && row[1] !== '') dl.append(h('div', {}, h('dt', {}, row[0]), h('dd', {}, row[1])));
  return dl;
}

// Note: item 474: small period glyphs drawn beside skills, traits and standing; one stroke path each on a 16 unit square.
const GLYPHS = {
  sight: 'M8 1v4M8 11v4M1 8h4M11 8h4M8 5a3 3 0 1 0 .01 0',
  anvil: 'M2 4h12l-2 3H9v3l3 3H4l3-3V7H4z',
  eye: 'M1 8q7-7 14 0q-7 7-14 0M8 6a2 2 0 1 0 .01 0',
  bottle: 'M7 1h2v4l2 2v8H5V7l2-2z',
  cards: 'M3 3l6-1 2 11-6 1zM9 2l4 1-1 10',
  fist: 'M4 6h8v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 6V4h8v2M8 4v2',
  pistol: 'M1 5h11v3H7l-1 5H3l1-5H1zM12 6h3',
  shield: 'M8 1l6 2v5q0 5-6 7q-6-2-6-7V3z',
  flame: 'M8 1q4 5 3 9a3 3 0 0 1-6 0q0-2 2-4q0 3 1 3q1-4 0-8',
  ear: 'M5 13q-1-3 0-6a4 4 0 1 1 7 2q-2 1-2 3a2 2 0 0 1-4 1',
  star: 'M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z',
  coin: 'M8 2a6 6 0 1 0 .01 0M8 5v6M6 6h3a1 1 0 0 1 0 2H7a1 1 0 0 0 0 2h3',
  hand: 'M4 9V4a1 1 0 0 1 2 0v4V3a1 1 0 0 1 2 0v5V4a1 1 0 0 1 2 0v6l2-2a1 1 0 0 1 1 2l-3 4H6z',
  thorn: 'M2 14L14 2M6 10l-3-1M9 7l1-3M10 6l3 1M5 11l1 3',
  purse: 'M3 6h10l1 8H2zM6 6V4a2 2 0 0 1 4 0v2',
  paper: 'M3 1h7l3 3v11H3zM5 6h6M5 9h6M5 12h4',
};
function glyph(id) {
  return sv('svg', { class: 'c-glyph', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, sv('path', { d: GLYPHS[id] }));
}

// Note: items 463, 474: a person's three skills as glyph, name and a plain word, with what each means on hover.
function skillRow(skills) {
  return h('ul', { class: 'c-skills', 'aria-label': 'Skills' }, skills.map((s) => h('li', { 'data-tip': `${s.label}: ${s.means}.` }, glyph(s.glyph), h('b', {}, s.label), ` ${s.word}`)));
}

// Note: items 474, 495: how a person gets on with each of the others, as chips with a glyph and a plain word; ordinary terms are left out (user direction).
function bondChips(bonds) {
  const shown = (bonds || []).filter((b) => b.tone !== 'plain');
  if (!shown.length) return null;
  return h('ul', { class: 'c-traits', 'aria-label': 'Gets on with' }, shown.map((b) => h('li', { class: `chip ${b.tone === 'good' ? 'good' : b.tone === 'down' ? 'down' : ''}`.trim(), 'data-tip': `${b.name}: ${b.word}.` }, glyph(b.glyph), ` ${b.name}: ${b.word}`)));
}

// Note: items 468, 474: earned traits as chips with a glyph; what each means is on hover.
function traitChips(traits) {
  if (!traits.length) return null;
  return h('ul', { class: 'c-traits', 'aria-label': 'Known for' }, traits.map((t) => h('li', { class: 'chip', 'data-tip': `${t.label}: ${t.means}.` }, glyph(t.glyph), ` ${t.label}`)));
}

function giverText(c) {
  return c.giver === 'notice' ? 'Posted on the notice board' : 'Told by a townsperson';
}

// Note: a case read for the first time is typed out like a telegram; the same case is never typed twice in a session.
const TYPED_PER_DRAW = 3;

function caseCard(c, buttons) {
  const where = !c.location.id ? 'Not yet known' : c.location.known ? c.location.name : `${c.location.name} (not on your map yet)`;
  const dist = c.distanceKm == null ? null : c.distanceKm < 1 ? 'Here' : `${c.distanceKm} km, about ${hoursText(c.rideHours)} on horseback`;
  const text = h('p', { class: 'c-text' }, c.text);
  if (!S.seen.has(c.id)) {
    S.seen.add(c.id);
    if (S.typeQueue.length < TYPED_PER_DRAW) S.typeQueue.push([text, c.text]);
  }
  // Note: item 289: a case known to be about one of the nemesis's men says so, with the man's portrait.
  const art = h('article', { class: `c-card has-face${c.connected ? ' is-connected' : ''}`, 'aria-label': c.title },
    face(c.associatePortrait || c.targetPortrait),
    h('h3', {}, c.title, c.connected ? h('span', { class: 'chip dead' }, `rides with ${c.connected}`) : null),
    text,
    facts([
      ['Where', where], c.lead ? ['Lead', `Seek ${c.lead.source} in ${c.lead.townName}`] : null, ['Distance', dist], c.site || c.facets ? ['Location', c.facets ? c.facets.location : c.site] : null, ['Danger', c.danger], ['The men', c.men],
      c.facets ? ['Defences', c.facets.defenses] : null,
      ['Pay', `${c.reward}, ${c.terms}`], ['Time', c.deadline], ['Source', giverText(c)],
    ]));
  if (c.returned) art.append(h('p', { class: 'c-note' }, 'This is a second trail: the target moved on after the first.'));
  if (c.attempts) art.append(h('p', { class: 'c-note' }, `${plural(c.attempts, 'attempt', 'attempts')} so far.`));
  if (c.history && c.history.length) {
    art.append(h('ul', { class: 'c-history', 'aria-label': 'History of the case' }, c.history.slice(-3).map((x) => h('li', {}, `${stampOf(x.min)} · ${x.text}`))));
  }
  if (buttons && buttons.length) art.append(h('div', { class: 'c-row' }, buttons));
  const prep = prepRow(c);
  if (prep) art.append(prep);
  const seek = seekRow(c);
  if (seek) art.append(seek);
  return art;
}

// Note: cases are listed nearest first from where the party is; a case with no known place or lead goes last, in its old order.
export const byDistance = (list) => list.map((c, i) => ({ c, i })).sort((a, b) => (a.c.sortKm ?? Infinity) - (b.c.sortKm ?? Infinity) || a.i - b.i).map((e) => e.c);

// Note: asks the lead's named source for the next report, from the case card or the arrival actions.
function seekLead(c) {
  const r = call('seekLead', c.id);
  if (!r.ok) {
    say(r.reason);
    cue('deny');
  } else say(r.expired ? 'The case lapsed before anyone could help.' : r.located ? 'The trail is confirmed: you know where he is.' : `The next lead points to ${r.lead.townName}.`);
  draw();
}

// Note: item 491: in the lead's town the player seeks its named source for the next report.
function seekRow(c) {
  if (!c.lead || !c.lead.here || !['available', 'accepted'].includes(c.status)) return null;
  return h('div', { class: 'c-row c-prep' }, btn(`Seek ${c.lead.source}`, () => seekLead(c), { cls: 'primary', key: `seek-${c.id}` }));
}

// Note: items 470 and 476: before riding out, ask townspeople about the case or buy a report from a contact who will talk; both take time and a report may cost money.
function prepRow(c) {
  if (!c.facets || c.facets.complete || !['available', 'accepted'].includes(c.status) || !V().at) return null;
  // Note: both calls answer with learned: the facet turned up, or null when nothing did.
  const done = (r) => {
    if (!r.ok) {
      say(r.reason);
      cue('deny');
    } else say(r.learned ? r.told : DRY_TODAY);
    draw();
  };
  const row = h('div', { class: 'c-row c-prep', 'aria-label': `Learn more about ${c.title}` },
    btn('Ask about it (30 min)', () => done(call('askAbout', c.id)), { cls: 'ghost', key: `ask-${c.id}`, disabled: c.askedDry, why: DRY_TODAY }));
  for (const k of S.contacts) {
    if (!k.willing) continue;
    row.append(btn(`Ask ${k.label} (${k.fee ? `${k.fee}, ` : ''}${hoursText(k.hours)})`, () => done(call('contactReport', k.id, c.id)), { cls: 'ghost', key: `report-${k.id}-${c.id}` }));
  }
  return row;
}

function flushType() {
  for (const [node, text] of S.typeQueue.splice(0)) if (node.isConnected) fx.typewrite(node, text, { cps: 110 });
}

// Note: the head of the ledger page: a small banner over a title, with an optional line of lede on the right.
const pageHead = (kicker, title, lede) => [
  h('div', { class: 'c-headl' },
    h('p', { class: 'banner' }, h('span', { 'aria-hidden': 'true' }, '★'), ` ${kicker} `, h('span', { 'aria-hidden': 'true' }, '★')),
    h('h1', { class: 'c-title', id: 'campH', tabindex: '-1' }, title)),
  lede ? h('p', { class: 'c-lede' }, lede) : null,
];

const footLeft = (kids, call = false) => h('div', { class: `c-foot-left${call ? ' is-call' : ''}` }, kids);
const medal = () => sv('svg', { class: 'c-medal', viewBox: '0 0 100 100', 'aria-hidden': 'true' }, sv('use', { href: '#badge' }));

const TABS = [
  ['saloon', 'Saloon', (t) => t.services.saloon],
  ['board', 'Notice board', (t) => t.services.notices],
  ['ask', 'Ask around', (t) => t.services.ask],
  ['cases', 'Your cases', () => true],
  ['shop', 'Store, livery', (t) => t.services.store || t.services.livery],
  ['doctor', 'Doctor', (t) => t.services.doctor],
  ['recruit', 'Hire hands', (t) => t.services.recruit],
  ['crew', 'Crew', () => true],
  ['rest', 'Rest', () => true],
];

// Note: three single lines in the page head: the region and its climate, the blurb, and the honest note when the record of the place is doubtful (item 172).
function townLede(v, t) {
  const note = uncertaintyNote(PLACES[t.id]);
  const r = v.region;
  return [
    r ? h('span', { class: 'mv-l', 'data-tip': `${r.name}: ${r.climate}` }, h('b', {}, r.name), ` · ${r.climate}`) : null,
    t.blurb ? h('span', { class: 'mv-l', 'data-tip': t.blurb }, t.blurb) : null,
    note ? h('span', { class: 'mv-l is-doubt', 'data-tip': note.text }, note.lead) : null,
  ];
}

function screenTown(v) {
  const t = S.camp.town();
  const tabs = TABS.filter((x) => x[2](t));
  S.tabs = tabs.map((x) => x[0]);
  if (!S.tabs.includes(S.tab)) S.tab = 'cases';
  const list = h('div', { class: 'c-tabs', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': `${t.name} pages` });
  tabs.forEach(([id, label], i) => {
    const fresh = (id === 'board' && t.newNotices) || (id === 'ask' && t.newTalk);
    list.append(h('button', {
      type: 'button',
      role: 'tab',
      class: `c-tab${S.tab === id ? ' is-on' : ''}`,
      'aria-selected': S.tab === id ? 'true' : 'false',
      'aria-keyshortcuts': String(i + 1),
      tabindex: S.tab === id ? '0' : '-1',
      'data-key': `tab-${id}`,
      'data-sfx': 'tab',
      onclick: () => openTab(id),
    }, h('span', {}, label, fresh ? h('i', { class: 'c-new', 'data-tip': 'New since you last looked' }, ' ●') : null), h('span', { class: 'c-k', 'aria-hidden': 'true' }, String(i + 1))));
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = S.tabs.indexOf(S.tab) + (e.key === 'ArrowDown' ? 1 : -1);
    openTab(S.tabs[(i + S.tabs.length) % S.tabs.length]);
  });
  const waiting = byDistance(v.accepted.filter((c) => c.location.id === v.at));
  // Note: leads to follow in this town: taken cases first, then offers heard here.
  const leadsHere = [...v.accepted, ...(t.notices || []), ...(t.offers || [])].filter((c, i, all) => c.lead && c.lead.here && ['available', 'accepted'].includes(c.status) && all.findIndex((o) => o.id === c.id) === i);
  const panel = PANELS[S.tab](v, t);
  panel.setAttribute('role', 'tabpanel');
  // Note: items 288 and 299: when the nemesis is in this town the player chooses when to face him.
  const here = v.story && v.story.here;
  const left = here
    ? footLeft([
      h('p', {}, h('b', {}, `${v.story.nemesis.label} is in ${v.atName}.`), ' Your crew may watch, but this is yours alone.'),
      bigBtn('Face him', faceNemesis, { cls: 'danger', key: 'face-nemesis', aria: `Face ${v.story.nemesis.label}` }),
    ], true)
    : waiting.length || leadsHere.length
    ? footLeft([hereLine(waiting, leadsHere), hereButton(waiting, leadsHere)], true)
    : footLeft(h('p', {}, `Keys: 1–${tabs.length} pages · Esc menu · M sound`));
  return {
    nav: [h('p', { class: 'c-nav-h' }, 'Pages'), list, h('i', { class: 'c-fill' }), medal()],
    head: pageHead(`${t.kind === 'town' ? 'Town' : cap1(t.kind)} · ${t.facts.jurisdictionName}`, t.name, townLede(v, t)),
    body: panel,
    foot: [left,
      bigBtn('Map, departure →', () => go('travel'), { cls: 'primary', key: 'to-travel', sfx: 'tab' }),
      bigBtn('Journal', showJournal, { cls: 'ghost', key: 'journal', sfx: 'open' }),
      bigBtn('Menu', showMenu, { cls: 'ghost', key: 'menu', sfx: 'open' })],
  };
}

// Note: what waits in this town, in one line: the cases here and the leads whose source is here (item 491).
function hereLine(waiting, leads) {
  const say = [
    waiting.length ? (waiting.length === 1 ? 'A case waits' : `${waiting.length} cases wait`) : null,
    leads.length ? (leads.length === 1 ? 'a lead points' : `${leads.length} leads point`) : null,
  ].filter(Boolean).join(' and ');
  return h('p', {}, h('b', {}, `${say[0].toUpperCase()}${say.slice(1)} here: `), [...waiting, ...leads].map((c) => c.title).join(' · '));
}

// Note: the action bar has one button for what waits here: a single case or lead is taken at once, and more than one opens the choice of them all.
function hereButton(waiting, leads) {
  if (waiting.length + leads.length > 1) {
    const label = !leads.length ? 'Choose a case' : !waiting.length ? 'Choose a lead' : 'Choose a case or lead';
    return bigBtn(label, () => openHere(waiting.map((c) => c.id), leads), { cls: 'primary', key: waiting.length ? 'go-case' : 'seek-leads' });
  }
  if (waiting.length) return bigBtn('Go to the case', () => goToCase(waiting[0].id), { cls: 'primary', key: 'go-case' });
  // Note: a fixed-width button named by the person alone; the full source is in its tip, and the Cases page lists every lead.
  const c = leads[0];
  return bigBtn(h('span', { class: 'c-btn-label' }, `Seek ${c.lead.source.split(',')[0]}`), () => seekLead(c), { cls: 'primary', key: `quick-seek-${c.id}`, tip: `Seek ${c.lead.source} about ${c.title}`, aria: `Seek ${c.lead.source} about ${c.title}` });
}

function openTab(id) {
  if (id === S.tab) return;
  S.tab = id;
  S.refocus = `tab-${id}`;
  S.focus = 'key';
  fx.clearToasts();
  draw();
}

// Note: walking is local to a visit, while cash, clock and talk always go through the Campaign.
function panelSaloon() {
  const box = h('section', { class: 'c-panel' }, panelHead('Saloon'));
  box.append(hint('Walk to the bar, a patron, or a card table to interact. W A S D or the arrow keys walk; F uses what is in front of you.'));
  box.append(bigBtn('Enter the saloon', () => {
    const visit = call('enterSaloon');
    if (!visit.ok) { say(visit.reason); return; }
    S.saloonPatron = visit.patron;
    go('saloon');
  }, { cls: 'primary', key: 'enter-saloon' }));
  return box;
}

// Note: the live saloon of this visit; it is rebuilt when the visit changes and never saved, so the people are new on every visit.
function liveSaloon(service) {
  const state = S.camp.state;
  const visit = state.saloonVisit;
  const key = `${visit.seed}:${state.at}`;
  if (S.saloon && S.saloon.key === key) return S.saloon;
  if (S.saloon) S.saloon.view.destroy();
  // Note: the teammates riding with the party stand in the town too, so presentIn decides who sits in the saloon (item 250).
  const crew = presentIn(state, state.at).filter((c) => c.role !== 'sheriff').map((c) => ({ id: c.id, name: c.name }));
  const room = buildRoom(state.seed, { id: state.at, services: { saloon: service } });
  const scene = new SaloonScene(room, { seed: visit.seed, patron: visit.patron, offer: service, crew, drunk: (V().crew.find((c) => c.role === 'sheriff') || {}).drinkLevel || 0 });
  const live = { key, room, scene, stake: '1.00', panel: null, foot: null, view: null };
  live.view = createSaloonView(scene, {
    act: (id) => saloonDo(id),
    sound: cue,
    label: (a, t) => (t && t.actor ? `${a.label} to ${t.actor.name}` : a.price ? `${a.label} · ${dollars(a.price)}` : a.label),
    paused: () => S.modal || S.busy || S.sceneOn || S.screen !== 'saloon' || fx.busy(),
    handsOff: () => S.modal || S.sceneOn || S.screen !== 'saloon',
    mood: () => moodOf(S.view?.time?.time),
    onContext: (t) => paintSaloon(live, t),
  });
  S.saloon = live;
  cue('saloon_door');
  return live;
}

const SALOON_IDLE = 'Nothing within reach.';

// Note: the side panel and the prompt line follow whatever the sheriff stands next to; both have fixed-height slots, so nothing around them moves.
function paintSaloon(live, t) {
  if (live.foot) {
    const a = t && t.actions[0];
    live.foot.replaceChildren(...(a ? [h('b', {}, 'F'), ` ${t.actor ? `Talk to ${t.actor.name}` : a.label}${t.actions.length > 1 ? `, or ${t.actions[1].label.toLowerCase()}` : ''}`] : [SALOON_IDLE]));
  }
  const panel = live.panel;
  if (!panel) return;
  const cents = S.camp.saloon().cents;
  const kids = [h('p', { class: 'c-nav-h' }, 'Right here')];
  if (!t) kids.push(h('p', { class: 'saloon-who' }, 'Nothing close'), h('p', { class: 'c-nav-note' }, 'The bar, a table or a patron.'));
  else {
    kids.push(h('p', { class: 'saloon-who' }, t.actor ? t.actor.name : cap1(t.label)));
    if (t.actor) kids.push(h('p', { class: 'c-nav-note' }, live.scene.describe(t.actor).slice(t.actor.name.length + 2)));
    for (const a of t.actions) {
      if (a.stake) {
        kids.push(h('label', { class: 'saloon-stake' }, 'Stake ($)', h('input', {
          type: 'number', min: '0.01', step: '0.01', max: String(cents / 100), value: live.stake, 'aria-label': 'Stake in dollars', 'data-key': 'saloon-stake',
          oninput: (e) => { live.stake = e.target.value; },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saloonDo(a.id); } },
        })));
      }
      kids.push(btn(a.price ? `${a.label} · ${dollars(a.price)}` : a.label, () => saloonDo(a.id), { key: `saloon-${a.id}` }));
    }
  }
  panel.replaceChildren(...kids);
}

function leaveSaloon() {
  const r = call('leaveSaloon');
  if (r && r.ok === false) { say(r.reason); draw(); return; }
  cue('saloon_door');
  if (S.saloon) S.saloon.view.destroy();
  S.saloon = null;
  go('town');
}

function saloonDo(id) {
  const live = S.saloon;
  const ctx = live && live.scene.context;
  const action = ctx && ctx.actions.find((a) => a.id === id);
  if (!action) return;
  const name = action.game || action.id;
  live.scene.lock = false;
  const r = live.scene.act({ saloonActivity: (a, stake) => call('saloonActivity', a, stake) }, id, Math.round(Number(live.stake) * 100));
  if (r.leave) { leaveSaloon(); return; }
  const sceneCue = name === 'talk' ? 'murmur' : name === 'drink' || name === 'meal' ? 'glass_clink' : 'cards';
  if (r.ok) cue(sceneCue);
  if (r.ok && name === 'drink') live.scene.drunk = (V().crew.find((c) => c.role === 'sheriff') || {}).drinkLevel || 0;
  if (!r.ok) say(r.reason);
  else if (name === 'talk') {
    say(r.newCount ? `You hear of ${counted(r.newCount, 'case', 'cases')}.` : 'The patron has no new cases to report.');
    learnedLine(r.learned);
  } else if (r.net != null) say(`${cap1(name)}: ${r.net > 0 ? 'won' : 'lost'} ${dollars(Math.abs(r.net))} in ${r.minutes} minutes.`);
  else say(`You have ${name === 'drink' ? 'a drink' : 'a meal'} for ${dollars(r.cost)} (${r.minutes} minutes).`);
  S.refocus = 'saloon-floor';
  if (r.challenge) go('duel');
  else if (r.brawl) go('brawl');
  else if (r.spectacle) go('spectacle');
  else draw();
}

function screenSaloon(v) {
  const service = S.camp.saloon();
  const visit = S.camp.state.saloonVisit;
  if (!service.ok || !visit || visit.town !== S.camp.state.at) {
    S.screen = 'town';
    return screenTown(v);
  }
  const live = liveSaloon(service);
  const entering = S.focus === 'head';
  live.panel = h('section', { class: 'saloon-panel', 'aria-label': 'What is in front of you' });
  live.panel.addEventListener('focusin', () => { live.scene.lock = true; });
  live.panel.addEventListener('focusout', (e) => { if (!live.panel.contains(e.relatedTarget)) live.scene.lock = false; });
  live.foot = h('p', { class: 'saloon-prompt-line' });
  paintSaloon(live, live.scene.context);
  // Note: the view loop starts once the floor is in the page, and the floor takes the focus on entry so the keys work at once.
  Promise.resolve().then(() => {
    if (S.screen !== 'saloon' || S.saloon !== live) return;
    live.view.start();
    if (entering && !S.modal) live.view.focus();
  });
  return {
    nav: [h('p', { class: 'c-nav-h' }, 'Saloon'), h('p', { class: 'c-nav-note' }, 'W A S D or the arrow keys walk. F uses what is in front of you. Press and hold on the floor to walk toward the pointer.'), live.panel, medal()],
    head: pageHead('Saloon', v.atName, 'A little company and a game of cards.'),
    body: h('section', { class: 'saloon-stage' }, live.view.el),
    foot: [footLeft(live.foot), bigBtn('Leave saloon', leaveSaloon, { cls: 'ghost', key: 'leave-saloon' })],
    split: true,
  };
}

// Note: item 202: one answer to a challenge; true when the duel goes ahead.
function persuadeDuel(challenge, approach) {
  const r = call('duelPersuade', approach);
  if (!r.ok) {
    say(r.reason);
    return false;
  }
  if (r.persuaded) {
    say(`${challenge.opponent.name} backs down.`);
    return false;
  }
  say(`${challenge.opponent.name} will not be talked out of it.`);
  return true;
}

// Note: a duel talked down is over, so the next challenge is staged afresh (item 315).
function talkedDown() {
  if (S.camp.duel()) { draw(); return; }
  S.staged = null;
  go('saloon');
}

// Note: the places are taken and the exchange begins at once; the standoff is the duel view itself (item 385).
function beginDuel() {
  const r = call('duelBegin');
  if (!r.ok) { say(r.reason); draw(); return; }
  S.duelSim = new DuelSim(r.duel);
  draw();
  const sim = S.duelSim;
  windUntilDraw(sim, () => S.screen === 'duel' && S.duelSim === sim);
}

// Note: the sheriff answers on the reply's panel; a challenged teammate tries on his own (item 202); the final duel offers no persuasion (item 384).
async function stageDuel(challenge, key) {
  const asked = challenge.phase === 'challenge';
  const persuade = asked ? (challenge.watch ? 'auto' : 'persuade') : null;
  const ahead = await challengeCard(challenge, { persuade, onChoice: (kind, value) => persuadeDuel(challenge, value === 'auto' ? 'auto' : value) });
  if (S.staged !== key || S.screen !== 'duel') return;
  if (!ahead) {
    talkedDown();
    return;
  }
  if (S.camp.duel()?.phase === 'ready') beginDuel();
  else draw();
}

function screenDuel(v) {
  const challenge = S.camp.duel();
  if (!challenge) { S.screen = 'saloon'; return screenSaloon(v); }
  // Note: items 315, 384: the challenge scene opens every duel once; the persuasion is its choice panel, and the face-off's Continue takes the places.
  const stageKey = `${challenge.town}:${challenge.opponent.id}:${challenge.charId}:${challenge.dispute}`;
  if (S.staged !== stageKey && challenge.phase !== 'exchange') {
    S.staged = stageKey;
    stageDuel(challenge, stageKey);
  }
  const shell = (body) => ({
    nav: [h('p', { class: 'c-nav-h' }, 'Duel'), h('p', { class: 'c-nav-note' }, challenge.venue), medal()],
    head: pageHead('Duel', 'Showdown', `${challenge.name} and ${challenge.opponent.name}, ${challenge.distance} metres apart, ${challenge.venue}.`),
    body,
    foot: [footLeft(h('p', {}, 'Escape opens the menu.')), bigBtn('Menu', showMenu, { cls: 'ghost', key: 'menu' })],
    split: true,
  });
  if (challenge.phase === 'challenge') return shell(challengeScreen(challenge, { onAnswer: (approach) => { persuadeDuel(challenge, approach); talkedDown(); } }));
  if (challenge.phase === 'ready') return shell(readyScreen(challenge, { onBegin: beginDuel }));
  if (!S.duelSim) S.duelSim = new DuelSim(challenge);
  const sim = S.duelSim;
  // Note: the exchange has the window, so the screen is drawn again without a second duel; the mounted duel stays while its sim does.
  if (!S.duelUi || S.duelUi.sim !== sim || S.duelUi.ui.disposed) {
    // Note: a teammate fights on his own; the sheriff only watches, and the only control he has is to skip.
    const watched = !!challenge.watch;
    const ctx = { sim, challenge, ui: null };
    const commit = (report) => () => finishDuel(ctx, report);
    dropDuelUi();
    ctx.ui = mountDuel(sim, {
      sound: cue, warp: duelWarp, watch: watched, quick: false,
      site: challenge.site, names: { player: challenge.name, opponent: challenge.opponent.name }, witnesses: challenge.witnesses, mood: moodOf(S.view?.time?.time),
      sides: { player: { role: S.camp.state.crew.find((c) => c.id === challenge.charId)?.role === 'sheriff' ? 'sheriff' : 'deputy', face: challenge.portrait?.face }, opponent: { reputation: challenge.opponent.reputation, face: challenge.opponent.portrait?.face } },
      paused: () => document.hidden || S.modal || S.busy || !campVisible(),
      alive: () => S.screen === 'duel' && S.duelSim === sim,
      focusOk: () => !S.modal,
      leave: () => { dropDuelUi(); leaveToTitle(); },
      ending: (report) => ({ buttons: [{ label: 'Continue', key: 'exchange-continue', run: commit(report) }], hold: commit(report) }),
    });
    S.duelUi = ctx;
  }
  return shell(S.duelUi.ui.el);
}

// Note: the mounted duel and spectacle are let go in one place, so no window listener or timer outlives the screen.
function dropDuelUi() {
  for (const key of ['duelUi', 'spectUi']) {
    if (S[key]) S[key].ui.dispose();
    S[key] = null;
  }
}

// Note: the result is committed once; a refusal is said on the screen and the player picks the retry or the restart.
function finishDuel(ctx, report) {
  const { sim, challenge } = ctx;
  if (S.duelSim !== sim || S.screen !== 'duel') return;
  const result = call('duelFinish', report);
  if (!result.ok) { refusedDuel(ctx, report, result.reason); return; }
  dropDuelUi();
  S.duelSim = null;
  S.app?.music?.start();
  // Note: item 377: a death of the office's own or the win plays next, so the outcome leaves its toll and its fallen panel to them.
  outcomeCard(challenge, report, result, { deathFollows: !!result.died, winFollows: !!(challenge.final && result.opponentDied) });
  S.staged = null;
  say(`${settledLine({ player: challenge.name, opponent: challenge.opponent.name }, report, result)}${result.fine ? ` Fine: ${dollars(result.fine)}.` : ''}`);
  if (result.account) say(result.account);
  if (result.reputation) say(`Reputation ${result.reputation > 0 ? '+' : ''}${result.reputation}.`);
  if (result.rest?.brawl) {
    say(`${result.rest.brawl.targetName} is in a saloon fight.`);
    go('brawl');
  } else if (result.rest?.interrupted) {
    say(`${result.rest.challenge.name} could not talk ${result.rest.challenge.opponent.name} out of a duel.`);
    go('duel');
  } else if (challenge.source === 'teammate-rest') {
    if (result.rest?.ok) say('The crew resumes its rest.');
    S.tab = 'rest';
    go('town');
  } else go(challenge.final ? 'town' : 'saloon');
}

// Note: items 314, 336, 382: arriving in a town is staged as the approach and the street; the crowd and the town's sound grow with its size.
const TOWN_SOUND = [0, 1, 2, 2, 3];
function arrivalCard(id) {
  const p = PLACES[id];
  if (!p) return null;
  const v = V();
  const size = TOWN_SOUND[Math.min(4, Math.max(0, p.size | 0))];
  const people = p.pop ? `${p.pop.toLocaleString('en-US')} people at the 1880 census` : `${cap1(SIZE_WORD[size] || 'a small place')}`;
  const party = v.crew.filter((c) => c.where === 'party' || c.where === id);
  return stage(arrivalScene({ town: p.name, when: `${v.time.label}, ${v.time.time}`, people, size, sound: size, party: party.map(person), mood: moodOf(v.time.time) }));
}
const SIZE_WORD = ['a hamlet', 'a small town', 'a town', 'a city'];

// Note: item 288: the player's own choice to face the nemesis; the challenge vignette follows on the duel screen.
function faceNemesis() {
  const r = call('faceNemesis');
  if (!r.ok) {
    say(r.reason);
    cue('deny');
    draw();
    return;
  }
  go('duel');
}

// Note: a cast member for a storyboard from a crew member, a fallen record or anyone with a portrait.
const person = (c, extra = {}) => (c && c.portrait ? { portrait: c.portrait, name: displayOf(c), ...extra } : null);
const nemesisOf = (st) => ({ portrait: st.nemesis.portrait, name: st.nemesis.label, traits: st.nemesis.traits, nemesis: true });

// Note: the persuasion choice of item 202 on the challenge's choice panel: the sheriff picks, a teammate tries on his own.
const PERSUADE = [{ value: 'intimidate', label: 'Intimidate' }, { value: 'explain', label: 'Explain' }];

// Note: items 315, 335, 384: the challenge, the reply, the walk out and the face-off; the challenge and the reply are voiced; resolves true when the duel goes ahead.
async function challengeCard(c, o = {}) {
  const v = c.quick ? null : V();
  const st = v && v.story;
  const crew = v ? v.crew.filter((m) => m.id !== c.charId && (m.where === 'party' || m.where === c.town)) : [];
  const me = { portrait: c.portrait, name: c.name };
  const him = c.final && st ? { ...nemesisOf(st), portrait: c.opponent.portrait } : { portrait: c.opponent.portrait, name: c.opponent.name };
  const line = c.final ? `${him.name}. For Sheriff ${st.murder.sheriff}, I have come for you.` : c.opponent.line || 'You and me, outside. Now.';
  const reply = c.final ? 'Then you came a long way to die.' : c.watch ? 'If that is how it must be.' : 'Then let us have it out.';
  const mine = c.quick || c.charId === sheriffId() ? 'sheriff' : v && v.crew.some((m) => m.id === c.charId) ? 'deputy' : 'hostile';
  const persuade = o.persuade || null;
  const scene = challengeScene({
    challenger: c.final ? me : him, challenged: c.final ? him : me, mine: me, line, reply, roles: c.final ? [mine, 'hostile'] : ['hostile', mine],
    saloon: !c.final && !c.quick, persuade, crew: crew.map(person).filter(Boolean), witnesses: c.witnesses !== false, mood: moodOf(S.view?.time?.time), final: !!c.final,
  });
  const r = await stage(scene, { quick: !!c.quick, choices: persuade ? { [persuade]: persuade === 'auto' ? 'auto' : PERSUADE } : {}, onChoice: o.onChoice });
  return !r.stopped;
}

const sheriffId = () => (V().crew.find((m) => m.role === 'sheriff') || {}).id;

// Note: items 329, 331, 385: the standoff is no panel; the duel view holds with dust blowing, and the wind goes on over the quiet duel tune until the first draw or shot.
// Note: alive tells whether the duel is still on screen; the gusts also stop after WIND_GUSTS, and sound at WIND_LEVEL of the cue's own level so the wind stays under the tune.
const WIND_GUSTS = 30;
const WIND_LEVEL = 0.2;
function windUntilDraw(sim, alive) {
  let left = WIND_GUSTS;
  const still = () => left-- > 0 && alive() && !sim.done && sim.draws.player === null && sim.draws.opponent === null && !sim.firstShot;
  const blow = () => {
    if (!still()) return;
    cue('wind', { level: WIND_LEVEL });
    later();
  };
  // Note: unref keeps a pending gust from holding a node test process open.
  const later = () => { const t = setTimeout(blow, 3600); t?.unref?.(); };
  cue('wind', { level: WIND_LEVEL });
  later();
}

// Note: item 386: the smoke, the victor with the judgment, and the fallen; o.deathFollows and o.winFollows leave the fallen panel and the toll to the scene that follows (item 377).
function outcomeCard(c, report, result, o = {}) {
  const lost = result.died;
  const gone = result.opponentDied;
  const me = { name: c.name, portrait: result.portraits?.player || c.portrait };
  const him = c.final && !c.quick ? { ...nemesisOf(V().story), portrait: result.portraits?.opponent || c.opponent.portrait } : { name: c.opponent.name, portrait: result.portraits?.opponent || c.opponent.portrait };
  // Note: each side is down when dead or not standing at the end; a man who gave up loses standing.
  const meDown = lost || report.playerStatus !== 'stopped';
  const himDown = gone || report.opponentStatus !== 'stopped';
  const meBeaten = meDown || report.surrendered;
  const himBeaten = himDown || report.opponentYielded;
  // Note: two dead men are a draw whatever the report names as winner, so no victor stands in the smoke.
  const draw = !!result.draw || (lost && gone);
  const victor = draw ? null : report.winner === 'player' ? me : report.winner === 'opponent' ? him : meBeaten && !himBeaten ? him : himBeaten && !meBeaten ? me : null;
  const fallen = [meDown ? me : null, himDown ? him : null].filter((x) => x && (draw || x !== victor));
  const dead = [lost ? me : null, gone ? him : null].filter(Boolean);
  const judgment = [result.account || null, result.fine ? `Fine: ${dollars(result.fine)}.` : null].filter(Boolean).join(' ') || null;
  // Note: the duel view stands the sheriff's side on the left and the opponent on the right, so every duel vignette keeps the same sides.
  return stage(outcomeScene({ victor, fallen, dead, draw, judgment, final: !!c.final, nemesisDied: !!(c.final && gone), deathFollows: !!o.deathFollows, winFollows: !!o.winFollows, standing: victor || draw ? [] : [me, him], mood: moodOf(S.view?.time?.time), victorSide: victor === me ? 'left' : 'right' }), { quick: !!c.quick });
}

// Note: nothing here repeats on its own; the player picks the retry or the restart, and the saved start of the exchange is untouched.
// Note: the outcome of a quarrel watched outside, staged like every duel's (item 386).
function quarrelOutcome(q, result) {
  const o = result.outcome || {};
  const report = { playerStatus: o.a === 'dead' || o.a === 'down' ? 'down' : 'stopped', opponentStatus: o.b === 'dead' || o.b === 'down' ? 'down' : 'stopped', winner: o.winner === 'a' ? 'player' : o.winner === 'b' ? 'opponent' : null };
  return outcomeCard({ ...q, portrait: result.portraits?.a || q.portrait, opponent: { ...q.opponent, portrait: result.portraits?.b || q.opponent.portrait } }, report, { died: o.a === 'dead', opponentDied: o.b === 'dead', account: result.account, draw: false });
}

function refusedDuel(ctx, report, reason) {
  say(reason);
  const restart = () => {
    dropDuelUi();
    S.duelSim = null;
    draw();
  };
  ctx.ui.refused(reason, [{ label: 'Try again', key: 'duel-retry', run: () => finishDuel(ctx, report) }, { label: 'Start the exchange over', key: 'duel-restart', run: restart }]);
}

// Note: a quarrel two others took outside; the sheriff watches it to the end or stays at the bar, and the outcome is the same either way.
function screenSpectacle(v) {
  const sp = S.camp.spectacle();
  if (!sp) { S.spectSim = null; S.screen = 'saloon'; return screenSaloon(v); }
  const shell = (body) => ({
    nav: [h('p', { class: 'c-nav-h' }, 'Trouble outside'), h('p', { class: 'c-nav-note' }, sp.site.label), medal()],
    head: pageHead('Trouble outside', v.atName, sp.text),
    body,
    foot: [footLeft(h('p', {}, 'Escape opens the menu.')), bigBtn('Menu', showMenu, { cls: 'ghost', key: 'menu' })],
    split: true,
  });
  const settled = (result) => {
    if (!result.ok) { say(result.reason); draw(); return; }
    S.spectSim = null;
    S.staged = null;
    if (result.watched) quarrelOutcome(quarrel, result);
    say(result.account);
    if (result.reputation) say(`Standing in town ${result.reputation > 0 ? '+' : ''}${result.reputation}.`);
    go('saloon');
  };
  // Note: item 315: a quarrel outside is a duel too and is staged the same way.
  const quarrel = { watch: true, name: sp.a.name, portrait: sp.a.portrait, opponent: { id: sp.b.name, name: sp.b.name, portrait: sp.b.portrait, line: 'You and me, outside. Now.' }, witnesses: true, venue: sp.site.label, distance: sp.site.distance, dispute: sp.dispute, charId: null, town: sp.town };
  const stageKey = `spectacle:${sp.town}:${sp.a.name}:${sp.b.name}`;
  // Note: the quarrel is staged once the sheriff chooses to watch it; one he ignores is only heard.
  if (S.staged !== stageKey && sp.phase === 'watching') {
    S.staged = stageKey;
    challengeCard(quarrel);
  }
  if (sp.phase === 'offer') {
    const watch = () => {
      const r = call('spectateWatch');
      if (!r.ok) say(r.reason);
      S.spectSim = null;
      draw();
    };
    return shell(offerScreen(sp, { onWatch: watch, onIgnore: () => settled(call('spectateIgnore')) }));
  }
  if (!S.spectSim) {
    S.spectSim = new DuelSim(sp.spec);
    const sim = S.spectSim;
    // Note: item 385: the standoff is the duel view itself; the wind starts once the challenge scene has closed.
    const waitScene = () => (S.modal ? setTimeout(waitScene, 200)?.unref?.() : windUntilDraw(sim, () => S.screen === 'spectacle' && S.spectSim === sim));
    waitScene();
  }
  const sim = S.spectSim;
  if (!S.spectUi || S.spectUi.sim !== sim || S.spectUi.ui.disposed) {
    const ctx = { sim, ui: null };
    const finish = () => {
      if (S.spectSim !== sim || S.screen !== 'spectacle') return;
      const result = call('spectateFinish');
      if (result.ok) { dropDuelUi(); settled(result); return; }
      say(result.reason);
      ctx.ui.refused(result.reason, [{ label: 'Try again', key: 'spectate-retry', run: finish }, { label: 'Leave them to it', key: 'spectate-leave', run: () => { dropDuelUi(); settled(call('spectateIgnore')); } }]);
    };
    dropDuelUi();
    ctx.ui = mountDuel(sim, {
      sound: cue, watch: true,
      site: sp.spec.site, names: { player: sp.a.name, opponent: sp.b.name }, mood: moodOf(S.view?.time?.time),
      sides: { player: { role: 'hostile', reputation: sp.a.reputation, face: sp.a.portrait.face }, opponent: { reputation: sp.b.reputation, face: sp.b.portrait.face } },
      paused: () => document.hidden || S.modal || S.busy || !campVisible(),
      alive: () => S.screen === 'spectacle' && S.spectSim === sim,
      focusOk: () => false,
      leave: () => { dropDuelUi(); leaveToTitle(); },
      ending: () => ({ buttons: [{ label: 'Continue', key: 'exchange-continue', run: finish }], hold: finish }),
    });
    S.spectUi = ctx;
  }
  return shell(S.spectUi.ui.el);
}

// Note: the account of a settled fight comes from the result's summary, so it names what really happened to each person.
function brawlLines(result) {
  const sum = result.summary;
  if (!sum) return [`The fight ${result.result === 'won' ? 'ended' : 'was lost'}.`];
  const lines = [sum.headline, ...sum.lines];
  // Note: the condition label already says hurt for the worse states, so it is not repeated.
  for (const p of sum.hurt) lines.push(/hurt|laid up/.test(p.condition) ? `${p.name} is ${p.condition}.` : `${p.name} is hurt: ${p.condition}.`);
  if (sum.loyalty && sum.loyalty.delta) lines.push(`${sum.loyalty.name}'s loyalty falls by ${-sum.loyalty.delta}.`);
  const spent = Object.entries(sum.ammo || {});
  if (spent.length) lines.push(`Rounds spent: ${spent.map(([type, n]) => `${n} ${type}`).join(', ')}.`);
  return lines;
}

// Note: the fight screen is torn down in one place; the view stops and nothing of the fight stays in the interface.
function endBrawl() {
  if (S.brawl) S.brawl.view.destroy();
  S.brawl = null;
  S.brawlSim = null;
}

// Note: items 316, 329, 387: the glass, the doors and the crowd, then the fighters on their two sides with those who started it marked.
function brawlCard(fight) {
  const who = fight.aggressors.map((a) => a.name);
  return stage(brawlOpenScene({
    sides: [[{ portrait: fight.portraits.target, name: fight.targetName }], fight.aggressors.map((a, i) => ({ portrait: fight.portraits.aggressors[i], name: a.name, started: true }))],
    starter: listOf(who),
    dispute: fight.dispute,
  }));
}

// Note: items 316, 329, 388: the wrecked room with the injured and their wounds, then the bill with coins when there are costs.
function brawlAftermath(result) {
  const sum = result.summary || {};
  const crew = V().crew;
  const hurt = sum.hurt || [];
  const injuries = hurt.map((p) => (/hurt|laid up/.test(p.condition) ? `${p.name} is ${p.condition}.` : `${p.name} is hurt: ${p.condition}.`));
  const spent = Object.entries(sum.ammo || {});
  const costs = [
    spent.length ? `Rounds spent: ${spent.map(([type, n]) => `${n} ${type}`).join(', ')}.` : null,
    sum.loyalty && sum.loyalty.delta ? `${sum.loyalty.name}'s loyalty falls by ${-sum.loyalty.delta}.` : null,
  ].filter(Boolean);
  return stage(brawlAfterScene({
    injured: hurt.map((p) => person(crew.find((c) => c.id === p.id))).filter(Boolean),
    injuries: [sum.headline, ...injuries].filter(Boolean),
    costs,
  }));
}

function afterBrawl(result, fight) {
  if (!result.ok) { say(result.reason); draw(); return; }
  endBrawl();
  brawlAftermath(result);
  if (result.rest?.brawl) {
    say(`${result.rest.brawl.targetName} is in a saloon fight.`);
    go('brawl');
  } else if (result.rest?.challenge) {
    say(`${result.rest.challenge.name} could not talk ${result.rest.challenge.opponent.name} out of a duel.`);
    go('duel');
  } else if (fight.source === 'teammate-rest') {
    if (result.rest?.ok) say('The crew resumes its rest.');
    S.tab = 'rest';
    go('town');
  } else go('saloon');
  // Note: the music resumes only after go() has set the track of the next screen, so the menu loop never plays in between.
  S.app?.music?.start();
}

// Note: the live fight of this screen; a reload or a restart builds it again from the saved start, so it is the same fight from its beginning.
function liveBrawl(fight) {
  const key = `${fight.seed}:${fight.town}`;
  if (S.brawl && S.brawl.key === key) return S.brawl;
  endBrawl();
  const sim = new BrawlSim(fight);
  const live = { key, fight, sim, view: null, panel: null, parts: null, line: null, exit: null, exitMode: null, info: null, refused: null };
  live.view = createBrawlView(sim, {
    sound: cue,
    paused: () => S.modal || S.busy || S.screen !== 'brawl' || !campVisible(),
    handsOff: () => S.modal || S.screen !== 'brawl' || !campVisible(),
    mood: () => moodOf(S.view?.time?.time),
    onHud: (info) => paintBrawl(live, info),
    onEnd: () => closeBrawl(live),
  });
  S.brawl = live;
  S.brawlSim = sim;
  return live;
}

const BRAWL_ORDERS = [['punch', 'Punch', 'F'], ['grapple', 'Grapple', 'G'], ['draw', 'Draw', 'Q'], ['fire', 'Fire', 'Space'], ['reload', 'Reload', 'R'], ['aim', 'Target', 'T']];

// Note: the panel follows the sim through onHud; it only changes what changed, so the buttons never move under the pointer.
function paintBrawl(live, info) {
  live.info = info;
  const p = live.parts;
  if (!p) return;
  const o = info.options;
  p.mood.textContent = info.label;
  p.meter.style.width = `${Math.max(4, Math.round((1 - info.strain) * 100))}%`;
  p.meter.className = info.strain >= 0.7 ? 'is-bad' : info.strain >= 0.4 ? 'is-hurt' : '';
  p.ammo.textContent = info.armed ? `${info.loaded} loaded · ${info.reserve} spare${info.drawn ? ' · revolver out' : ''}` : 'No revolver';
  p.sides.replaceChildren(h('span', {}, h('i', { class: 'brawl-dot brawl-mate' }), `Friends ${info.allies}`), h('span', {}, h('i', { class: 'brawl-dot brawl-aggressor' }), `Troublemakers ${info.foes}`));
  const on = { punch: o.punch, grapple: o.grapple, draw: o.draw || o.holster, fire: o.fire, reload: o.reload, aim: o.aim };
  const label = { punch: info.held ? 'Struggle' : 'Punch', grapple: info.holding ? 'Let go' : 'Grapple', draw: info.drawn ? 'Holster' : 'Draw', fire: 'Fire', reload: 'Reload', aim: 'Target' };
  for (const [id, , key] of BRAWL_ORDERS) {
    const b = p.buttons[id];
    if (on[id]) b.removeAttribute('aria-disabled');
    else b.setAttribute('aria-disabled', 'true');
    const text = `${label[id]} · ${key}`;
    if (b.textContent !== text) b.textContent = text;
  }
  live.line.textContent = live.refused ? `The result was not accepted: ${live.refused.reason}` : info.line;
  paintBrawlExit(live);
}

// Note: one button slot in the foot: leave while the fight is on, skip when the player is out of it, continue at the end, and retry or restart when the result was refused.
function paintBrawlExit(live) {
  const { view, exit } = live;
  const info = live.info || {};
  const mode = live.refused ? 'refused' : info.done ? 'continue' : info.out ? 'skip' : 'leave';
  if (live.exitMode === mode && exit.childNodes.length) return;
  live.exitMode = mode;
  if (mode === 'refused') {
    exit.replaceChildren(
      bigBtn('Try again', () => finishBrawl(live, live.refused.report), { key: 'brawl-retry' }),
      bigBtn('Start the fight over', () => { endBrawl(); go('brawl'); }, { cls: 'ghost', key: 'brawl-restart' }));
  } else if (mode === 'continue') exit.replaceChildren(bigBtn('Continue', () => view.skip(), { key: 'brawl-continue' }));
  else if (mode === 'skip') exit.replaceChildren(bigBtn('Skip to the end', () => view.hurry(), { cls: 'ghost', key: 'brawl-skip' }));
  else exit.replaceChildren(bigBtn('Leave the fight · X', () => { view.give('leave'); view.focus(); }, { cls: 'ghost', key: 'brawl-leave' }));
}

// Note: the one place a fight is handed to the Campaign; the view calls it once after the closing beat, and a refusal waits for the player.
function closeBrawl(live) {
  if (S.brawl !== live || S.screen !== 'brawl') return;
  finishBrawl(live, live.sim.report());
}

function finishBrawl(live, report) {
  if (S.brawl !== live || S.screen !== 'brawl') return;
  const result = call('brawlFinish', report);
  if (!result.ok) { refusedBrawl(live, report, result.reason); return; }
  afterBrawl(result, live.fight);
}

// Note: nothing here repeats on its own; the saved start is untouched, so the player can send the same report again or play the fight over.
function refusedBrawl(live, report, reason) {
  say(reason);
  live.refused = { report, reason };
  draw();
}

function screenBrawl(v) {
  const fight = S.camp.brawl();
  if (!fight) { endBrawl(); S.screen = 'town'; return screenTown(v); }
  const shell = (body) => ({
    nav: [h('p', { class: 'c-nav-h' }, 'Saloon fight'), h('p', { class: 'c-nav-note' }, v.atName), medal()],
    head: pageHead('Saloon fight', v.atName, `${fight.targetName} is caught in a fight over ${fight.dispute}.`),
    body,
    foot: [footLeft(h('p', {}, 'The fight begins in the saloon.'))],
  });
  // Note: item 316: every brawl opens with a card of the fighters and who started it.
  const stageKey = `brawl:${fight.seed}`;
  if (S.staged !== stageKey) {
    S.staged = stageKey;
    brawlCard(fight);
  }
  if (fight.phase === 'choice') {
    endBrawl();
    return shell(h('section', { class: 'c-panel' },
      h('p', { class: 'c-text' }, `${fight.aggressors.map((a) => a.name).join(' and ')} ${fight.aggressors.length === 1 ? 'has' : 'have'} started a fight with ${fight.targetName}.`),
      fight.canIntervene ? null : h('p', { class: 'c-alert' }, fight.reasonIntervene),
      h('div', { class: 'c-row' },
        fight.canIntervene ? bigBtn('Intervene', () => {
          const result = call('brawlChoose', true);
          if (!result.ok) { say(result.reason); draw(); return; }
          S.app?.music?.stop();
          go('brawl');
        }, { cls: 'danger', key: 'brawl-intervene' }) : null,
        fight.canStayOut ? bigBtn('Stay out', () => {
          const result = call('brawlStayOut');
          afterBrawl(result, { ...fight, intervene: false });
        }, { cls: 'ghost', key: 'brawl-stay-out' }) : null)));
  }
  const live = liveBrawl(fight);
  live.fight = fight;
  live.exitMode = null;
  const entering = S.focus === 'head';
  const parts = { mood: h('small', {}), meter: h('i', {}), ammo: h('p', { class: 'brawl-ammo' }), sides: h('p', { class: 'brawl-sides' }) };
  const press = (order) => () => { live.view.give(order); live.view.focus(); };
  parts.buttons = Object.fromEntries(BRAWL_ORDERS.map(([id, name, key]) => [id, btn(`${name} · ${key}`, press(id), { key: `brawl-${id}` })]));
  live.parts = parts;
  live.line = h('p', { class: 'brawl-line', role: 'status' });
  live.exit = h('div', { class: 'brawl-exit' });
  live.panel = h('section', { class: 'brawl-panel', 'aria-label': 'Your orders' },
    h('p', { class: 'brawl-state' }, 'You', parts.mood),
    h('div', { class: 'brawl-meter', role: 'img', 'aria-label': 'How much you can take' }, parts.meter),
    parts.ammo,
    h('div', { class: 'brawl-orders' }, Object.values(parts.buttons)),
    parts.sides);
  if (live.info) paintBrawl(live, live.info);
  else live.view.render();
  // Note: the view loop starts once the floor is in the page, and the floor takes the focus on entry so the keys work at once.
  Promise.resolve().then(() => {
    if (S.screen !== 'brawl' || S.brawl !== live) return;
    live.view.start();
    if (entering && !S.modal) live.view.focus();
  });
  return {
    nav: [h('p', { class: 'c-nav-h' }, 'Saloon fight'), live.panel, h('p', { class: 'c-nav-note' }, 'W A S D or the arrows walk. Press and hold on the floor to walk; tap a foe to strike.'), medal()],
    head: pageHead('Saloon fight', v.atName, `${fight.targetName} is caught in a fight over ${fight.dispute}.`),
    body: h('section', { class: 'brawl-stage' }, live.view.el),
    foot: [footLeft(live.line), live.exit],
    split: true,
  };
}

function learnedLine(id) {
  if (id) say(`${placeName(id)} is now on your map.`);
}

// Note: the stamp lands where the player pressed, the case moves to "Your cases".
function acceptButton(c) {
  return btn('Accept the case', () => {
    const r = call('accept', c.id);
    if (r.ok) {
      say(`Accepted "${c.title}".`);
      if (r.revealed) say(`${placeName(r.revealed)} is now on your map.`);
      fx.stamp('Accepted');
    } else {
      say(r.reason);
      cue('deny');
    }
    draw();
  }, { cls: 'primary', key: `accept-${c.id}` });
}

function panelBoard(v, t) {
  const box = h('section', { class: 'c-panel' }, panelHead('Notice board'));
  box.append(
    hint(t.newNotices ? 'New postings have gone up since you last looked.' : 'Postings stay up until somebody takes them or they lapse.'),
    h('div', { class: 'c-row' }, btn('Read the board (20 min)', () => {
      const r = call('readNotices');
      if (!r.ok) {
        say(r.reason);
        cue('deny');
      } else {
        say(r.newCount ? `You read ${counted(r.newCount, 'new posting', 'new postings')}.` : 'Nothing new has been posted.');
        learnedLine(r.learned);
      }
      draw();
    }, { cls: 'primary', key: 'read-board' })));
  if (!t.notices.length && !t.newNotices) box.append(h('p', { class: 'c-empty' }, 'Nothing on the board concerns the law.'));
  for (const c of byDistance(t.notices)) box.append(caseCard(c, [acceptButton(c)]));
  return box;
}

function panelAsk(v, t) {
  const box = h('section', { class: 'c-panel' }, panelHead('Ask around'));
  box.append(
    hint(t.newTalk ? 'There is talk in town you have not heard yet.' : 'Townspeople may know of trouble nearby.'),
    h('div', { class: 'c-row' }, btn('Ask around (45 min)', () => {
      const r = call('askAround');
      if (!r.ok) {
        say(r.reason);
        cue('deny');
      } else {
        say(r.newCount ? `You hear of ${counted(r.newCount, 'case', 'cases')}.` : 'Nobody has trouble to report today.');
        learnedLine(r.learned);
      }
      draw();
    }, { cls: 'primary', key: 'ask-around' })));
  if (!t.offers.length && !t.newTalk) box.append(h('p', { class: 'c-empty' }, 'No one has told you of a case here that is still open.'));
  for (const c of byDistance(t.offers)) box.append(caseCard(c, [acceptButton(c)]));
  return box;
}

async function abandonCase(c) {
  const yes = await confirm(`Abandon "${c.title}"?`, [
    'Giving up a case you took costs the office its good name. Your standing in the territory and your crew\'s opinion of the star will both fall, and anyone hired for this case goes home.',
  ], 'Abandon the case', 'Keep the case', true);
  if (yes) {
    const r = call('abandon', c.id);
    say(r.ok ? `You abandon "${c.title}". Word gets around.` : r.reason);
    if (r.ok) cue('hurt');
  }
  draw();
}

function panelCases(v) {
  const box = h('section', { class: 'c-panel' }, panelHead('Your cases'));
  if (!v.accepted.length) {
    box.append(h('p', { class: 'c-empty' }, 'You have taken no cases. Read the board, ask around, or ride where the trouble is.'));
    return box;
  }
  for (const c of byDistance(v.accepted)) {
    const here = c.location.id === v.at;
    const buttons = [];
    if (here) buttons.push(btn('Go to the case', () => goToCase(c.id), { cls: 'primary', key: `case-go-${c.id}` }));
    else if (c.location.known) buttons.push(btn(`Plan the trip to ${c.location.name}`, () => {
      S.dest = c.location.id;
      go('travel');
    }, { cls: 'primary', key: `case-trip-${c.id}`, sfx: 'tab' }));
    else if (c.lead && c.lead.known && !c.lead.here) buttons.push(btn(`Plan the trip to ${c.lead.townName}`, () => {
      S.dest = c.lead.town;
      go('travel');
    }, { cls: 'primary', key: `case-trip-${c.id}`, sfx: 'tab' }));
    buttons.push(btn('Abandon', () => abandonCase(c), { cls: 'danger', key: `abandon-${c.id}` }));
    box.append(caseCard(c, buttons));
  }
  return box;
}

// Note: the refill tooltip names first what a press buys, then the cartridges this store lacks.
function ammoTip({ lines, short, missing }) {
  const bought = lines.map((l) => `${l.amount} ${AMMO_NAME[l.id.slice(5)] || l.id}`).join(', ');
  const parts = [lines.length ? `Buys ${bought}${short.length ? ', as far as the purse reaches' : ''}.` : short.length ? 'There is not enough money to buy more.' : missing.length ? 'Nothing else to buy.' : 'The crew has a full load and spare rounds for every gun.'];
  if (missing.length) parts.push(`Not sold here: ${missing.map((t) => AMMO_NAME[t] || t).join(', ')}.`);
  return parts.join(' ');
}

function panelShop(v) {
  const s = S.camp.shop();
  const box = h('section', { class: 'c-panel' }, panelHead('Store and livery'));
  if (!s.ok) {
    box.append(h('p', { class: 'c-empty' }, s.reason));
    return box;
  }
  const present = v.crew.filter((c) => c.where === v.at || c.where === 'party');
  if (!S.shopWho || !present.some((c) => c.id === S.shopWho)) S.shopWho = present[0] && present[0].id;
  const result = (r, ok) => {
    if (r.ok) say(ok);
    else {
      say(r.reason);
      cue('deny');
    }
    draw();
  };
  const AMOUNT = { water: (n) => `${n} L of water`, food: (n) => `${n} rations`, feed: (n) => `${n} feed` };
  // Note: a refill is one ordinary buy for each line of the plan the shop view gives, so the facade has no new call.
  const refill = () => {
    const { lines, short } = s.refill;
    if (!lines.length) {
      result({ ok: false, reason: short.length ? 'There is not enough money to buy more.' : 'The party already carries all it can.' });
      return;
    }
    const done = lines.map((l) => ({ l, r: call('buy', l.id, l.qty) }));
    const got = done.filter((x) => x.r.ok);
    const cost = got.reduce((sum, x) => sum + x.r.cost, 0);
    result(got.length ? { ok: true } : done[0].r, `Refilled for ${dollars(cost)}: ${got.map((x) => AMOUNT[x.l.id](x.l.amount)).join(', ')}${short.length ? '; the purse ran short' : ''}.`);
  };
  const refillBtn = btn(s.refill.lines.length ? `Refill all · ${dollars(s.refill.cents)}` : 'Refill all', refill, { key: 'refill-all', aria: 'Refill all supplies', tip: 'Water, rations and feed up to what the party can carry.' });
  // Note: the message after a press names first what was bought (or why nothing was), then the cartridges this store lacks, like the tooltip.
  const refillAmmo = () => {
    const { lines, short, missing } = s.ammoRefill;
    const gap = missing.length ? ` Not sold here: ${missing.map((t) => AMMO_NAME[t] || t).join(', ')}.` : '';
    if (!lines.length) {
      result({ ok: false, reason: `${short.length ? 'There is not enough money to buy more.' : missing.length ? 'Nothing else to buy.' : 'The crew already has a full load and spare rounds for every gun.'}${gap}` });
      return;
    }
    const done = lines.map((l) => ({ l, r: call('buy', l.id, l.qty) }));
    const got = done.filter((x) => x.r.ok);
    const cost = got.reduce((sum, x) => sum + x.r.cost, 0);
    if (!got.length) {
      result({ ok: false, reason: `${done[0].r.reason}${gap}` });
      return;
    }
    result({ ok: true }, `Bought for ${dollars(cost)}: ${got.map((x) => `${x.l.amount} ${AMMO_NAME[x.l.id.slice(5)] || x.l.id}`).join(', ')}${short.length ? ', as far as the purse reached' : ''}.${gap}`);
  };
  const refillAmmoBtn = btn(s.ammoRefill.lines.length ? `Refill ammo · ${dollars(s.ammoRefill.cents)}` : 'Refill ammo', refillAmmo, { key: 'refill-ammo', aria: 'Refill ammunition', tip: ammoTip(s.ammoRefill) });
  const groups = [['Supplies', 'supply'], ['Ammunition', 'ammo'], ['Explosives', 'explosive'], ['Weapons', 'weapon'], ['Transport', 'transport']];
  for (const [title, kind] of groups) {
    const goods = s.goods.filter((g) => g.kind === kind);
    if (!goods.length) continue;
    const list = h('ul', { class: 'c-goods', 'aria-label': title });
    for (const g of goods) {
      const row = h('li', { class: 'c-good' }, h('span', { class: 'c-good-name' }, g.label), h('span', { class: 'c-price' }, dollars(g.cents), g.sells && kind !== 'transport' ? h('small', {}, `sells ${dollars(g.sellCents)}`) : null));
      const acts = h('span', { class: 'c-row' });
      if (kind === 'supply' || kind === 'ammo' || kind === 'explosive') {
        S.qty[g.id] = S.qty[g.id] || 1;
        acts.append(
          h('label', { class: 'c-qty' }, h('span', { class: 'sr-only' }, `Lots of ${g.label}`),
            h('input', { type: 'number', min: '1', max: '99', value: String(S.qty[g.id]), 'data-key': `qty-${g.id}`, onchange: (e) => { S.qty[g.id] = Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || 1)); } })),
          btn('Buy', () => {
            const r = call('buy', g.id, S.qty[g.id]);
            result(r, `Bought ${r.amount < g.lot * S.qty[g.id] ? `${AMOUNT[g.id](r.amount)}, all the party can carry` : `${g.label.toLowerCase()}${S.qty[g.id] > 1 ? ` ×${S.qty[g.id]}` : ''}`}.`);
          }, { key: `buy-${g.id}`, aria: `Buy ${g.label}` }),
          btn('Sell', () => result(call('sell', g.id, S.qty[g.id]), `Sold ${g.label.toLowerCase()}.`), { cls: 'ghost', key: `sell-${g.id}`, aria: `Sell ${g.label} at ${dollars(g.sellCents)} each` }));
      } else if (kind === 'weapon') {
        acts.append(
          h('label', { class: 'c-who' }, h('span', { class: 'sr-only' }, `Who carries the ${g.label}`),
            h('select', { 'data-key': `who-${g.id}`, onchange: (e) => { S.shopWho = e.target.value; } },
              present.map((c) => h('option', { value: c.id, selected: c.id === S.shopWho }, displayOf(c))))),
          // Note: item 365: weapons are bought, never sold.
          btn('Buy', () => result(call('buy', g.id, 1, { forId: S.shopWho }), `Bought ${g.label}.`), { key: `buy-${g.id}`, aria: `Buy ${g.label}` }));
      } else if (g.sells) {
        row.firstChild.append(h('em', { class: 'c-cur' }, ' · yours now'));
        row.children[1].append(h('small', {}, `sells ${dollars(g.sellCents)}`));
        acts.append(btn('Sell', () => result(call('sell', g.id, 1), `Sold ${g.label.toLowerCase()}.`), { cls: 'ghost', key: `sell-${g.id}`, aria: `Sell ${g.label} at ${dollars(g.sellCents)} and go on foot`, tip: 'The party goes on foot.' }));
      } else {
        const old = s.transport.kind === 'foot' ? null : s.goods.find((x) => x.id === s.transport.kind);
        const net = g.cents - (old ? old.sellCents : 0);
        row.lastChild.replaceChildren(dollars(net), old ? h('small', {}, 'after trade-in') : '');
        acts.append(btn('Buy', () => result(call('buy', g.id, 1), `The party now travels ${g.label.toLowerCase()}.`), { key: `buy-${g.id}`, aria: `Buy ${g.label}` }));
      }
      row.append(acts);
      list.append(row);
    }
    box.append(h('h3', { class: 'c-grp' }, title, kind === 'supply' ? refillBtn : kind === 'ammo' ? refillAmmoBtn : null));
    if (kind === 'ammo') box.append(hint('Ammunition is shared out when a fight begins.'));
    if (kind === 'explosive') box.append(hint(`The office holds ${S.camp.state.dynamite || 0} ${(S.camp.state.dynamite || 0) === 1 ? 'bundle' : 'bundles'}. The sheriff takes up to ${DYNAMITE.sticks} into a fight; G throws one.`));
    box.append(list);
  }
  return box;
}

const REGION = { head: 'head', chest: 'chest', abdomen: 'belly', arm: 'arm', leg: 'leg' };

function injuryText(i) {
  const side = i.side ? `${i.side} ` : '';
  const state = i.lasting ? `lasting: ${i.lasting}` : i.treated ? 'treated' : i.healed >= 0.75 ? 'nearly mended' : i.healed >= 0.35 ? 'mending' : 'raw';
  return `${i.severity} wound, ${side}${REGION[i.region] || i.region} (${state})`;
}

function panelDoctor(v) {
  const d = S.camp.doctor();
  const box = h('section', { class: 'c-panel' }, panelHead('Doctor'));
  if (!d.ok) {
    box.append(h('p', { class: 'c-empty' }, d.reason));
    return box;
  }
  if (!d.available) {
    box.append(h('p', { class: 'c-empty' }, 'There is no doctor here.'));
    return box;
  }
  box.append(hint(`${d.care >= 0.8 ? 'A trained doctor.' : d.care >= 0.5 ? 'A country doctor of some skill.' : 'A barber-surgeon; he does what he can.'} Treatment costs money and takes time; the party waits while it is done.`));
  if (!d.patients.length) box.append(h('p', { class: 'c-empty' }, 'No one here has a wound that needs a doctor.'));
  for (const p of d.patients) {
    const who = p.display || p.name;
    const art = h('article', { class: 'c-card' },
      h('h3', {}, who, ' ', h('span', { class: `chip ${COND_CLASS[p.condition] || 'down'}` }, p.condition)),
      h('ul', { class: 'c-history' }, p.injuries.map((i) => h('li', {}, injuryText(i)))));
    if (p.quote) {
      art.append(h('p', { class: 'c-text' }, `The doctor asks ${dollars(p.quote.cents)} and ${hoursText(p.quote.minutes / 60)} for ${plural(p.quote.injuries, 'wound', 'wounds')}.`),
        h('div', { class: 'c-row' }, btn(`Treat ${who} (${dollars(p.quote.cents)}, ${hoursText(p.quote.minutes / 60)})`, () => {
          const r = call('treat', p.charId);
          if (r.ok) say(`${who} is treated: ${hoursText(r.minutes / 60)} at the doctor's, ${dollars(r.cents)} paid.`);
          else {
            say(r.reason);
            cue('deny');
          }
          draw();
        }, { cls: 'primary', key: `treat-${p.charId}` })));
    } else art.append(h('p', { class: 'c-note' }, 'Nothing more a doctor can do; time will tell.'));
    box.append(art);
  }
  return box;
}

function panelRecruit(v) {
  const c = S.camp.candidates();
  const box = h('section', { class: 'c-panel' }, panelHead('Hire hands'));
  if (!c.ok) {
    box.append(h('p', { class: 'c-empty' }, c.reason));
    return box;
  }
  box.append(hint(`${cap1(counted(c.room, 'place', 'places'))} free in the office. Whether someone signs depends on your name, how you are known to act, and the pay. They have heard of you as ${v.reputation.sheriff}.`));
  if (!c.list.length) box.append(h('p', { class: 'c-empty' }, 'No one is looking for work here today.'));
  for (const k of c.list) {
    const who = k.display || k.name;
    const o = S.offers[k.id] || (S.offers[k.id] = { how: 'week', cents: k.askWeeklyCents, caseId: v.accepted[0] ? v.accepted[0].id : null });
    const art = h('article', { class: 'c-card has-face' },
      face(k.portrait),
      h('h3', {}, who, ' ', h('span', { class: 'chip wanted' }, k.kind === 'appointed' ? 'wants a badge' : 'independent'), k.distinctive ? [' ', h('span', { class: 'chip good' }, k.distinctive)] : null),
      h('p', { class: 'c-text' }, `${k.blurb} Looks ${k.impression}; carries ${k.weapons && k.weapons.length ? listOf(k.weapons.map((n) => `a ${n}`)) : counted(k.armed, 'weapon', 'weapons')}.${k.heavy ? ' Drinks hard, by all accounts.' : ''}`),
      skillRow(k.skills),
      traitChips(k.traits),
      h('p', { class: 'c-note' }, k.kind === 'appointed' ? `Asks about ${dollars(k.askWeeklyCents)} a week.` : `Asks about ${dollars(k.askWeeklyCents)} a week, or ${dollars(k.askCaseCents)} for a case.`,
        k.lowestWeeklyCents != null && k.lowestWeeklyCents < k.askWeeklyCents ? ` Your name might bring him down to about ${dollars(k.lowestWeeklyCents)} a week.` : ''));
    const row = h('div', { class: 'c-row c-terms' });
    if (k.kind === 'independent' && v.accepted.length) {
      row.append(h('label', {}, h('span', { class: 'sr-only' }, `Terms for ${who}`),
        h('select', {
          'data-key': `how-${k.id}`,
          onchange: (e) => {
            o.how = e.target.value;
            o.cents = o.how === 'case' ? k.askCaseCents : k.askWeeklyCents;
            S.focus = 'key';
            draw();
          },
        }, h('option', { value: 'week', selected: o.how === 'week' }, 'By the week'), h('option', { value: 'case', selected: o.how === 'case' }, 'For one case'))));
      if (o.how === 'case') {
        row.append(h('label', {}, h('span', { class: 'sr-only' }, 'Which case'),
          h('select', { 'data-key': `case-${k.id}`, onchange: (e) => { o.caseId = e.target.value; } },
            v.accepted.map((a) => h('option', { value: a.id, selected: a.id === o.caseId }, a.title)))));
      }
    }
    row.append(h('label', { class: 'c-money' }, h('span', {}, o.how === 'case' ? 'For the case' : 'A week'),
      h('span', { class: 'c-cash' }, h('i', { 'aria-hidden': 'true' }, '$'), h('input', {
        type: 'number', min: '0', step: '0.5', value: (o.cents / 100).toFixed(2), 'data-key': `pay-${k.id}`, 'aria-label': o.how === 'case' ? 'Pay for the case in dollars' : 'Wage a week in dollars',
        onchange: (e) => { o.cents = Math.max(0, Math.round(Number(e.target.value) * 100) || 0); },
      }))));
    row.append(btn(k.kind === 'appointed' ? 'Appoint as deputy' : 'Hire', () => {
      const terms = k.kind === 'appointed' ? { kind: 'appointed', wageCentsPerWeek: o.cents }
        : o.how === 'case' ? { kind: 'case', caseId: o.caseId, casePayCents: o.cents } : { kind: 'ongoing', wageCentsPerWeek: o.cents };
      const r = call('recruit', k.id, terms);
      if (r.ok) {
        say(`${r.label || r.display || r.name} joins the office.`);
        fx.seal(k.kind === 'appointed' ? 'badge' : 'wax');
        // Note: item 328: signing on is stamped.
        cue('stamp');
        const sworn = k.kind === 'appointed' && V().crew.find((c) => c.name === k.name);
        if (sworn) swearIn(sworn).then(draw);
      } else {
        say(r.reason);
        cue('deny');
      }
      draw();
    }, { cls: 'primary', key: `hire-${k.id}` }));
    art.append(row);
    box.append(art);
  }
  return box;
}

function termsText(c) {
  const t = c.terms;
  if (t.kind === 'sheriff') return 'The star';
  if (t.kind === 'case') return `Hired for one case, ${dollars(t.casePayCents)} when it is settled`;
  return `${t.kind === 'appointed' ? 'Appointed deputy' : 'Hired by the week'}, ${dollars(t.wageCentsPerWeek)} a week`;
}

// Note: a framed portrait of a named character (item 311); p is the portrait of the view, or null for no picture.
function face(p, cls = '', label = '') {
  if (!p) return null;
  const cv = portraitCanvas(p.look, p.marks);
  cv.setAttribute('aria-hidden', 'true');
  return h('figure', { class: `c-face ${cls}`.trim() }, cv, label ? h('figcaption', {}, label) : null);
}

// Note: item 469: the office's and the sheriff's standing and what it does now, so the player can see its effects and infer what moved it; item 471: what the office has come upon.
function standingSection(v) {
  const r = v.reputation;
  return h('section', { class: 'c-standing', 'aria-label': 'Standing' },
    h('h3', { class: 'c-grp' }, 'Standing'),
    h('p', { class: 'c-text' }, `The sheriff is ${r.sheriff}; the office is ${r.team}.`),
    h('ul', { class: 'c-effects' }, r.effects.map((e) => h('li', {}, glyph(e.glyph), ` ${e.text}`))),
    v.rewards.length ? [h('h3', { class: 'c-grp' }, 'Opened to the office'), h('ul', { class: 'c-effects' }, v.rewards.map((x) => h('li', {}, glyph(x.kind === 'recruit' ? 'hand' : x.kind === 'equipment' ? 'pistol' : 'paper'), ` ${x.title}: ${x.text}${x.place ? ` (${x.place})` : ''}`)))] : null);
}

function panelCrew(v) {
  const box = h('section', { class: 'c-panel' }, panelHead('Crew'), standingSection(v));
  if (v.crew.length > 1) box.append(hint('Wages fall due by the week, whether or not the hand is with you.'));
  for (const c of v.crew) {
    const present = c.where === v.at || c.where === 'party';
    const art = h('article', { class: 'c-card has-face' },
      face(c.portrait),
      h('h3', {}, displayOf(c), ' ', h('span', { class: `chip ${COND_CLASS[c.condition] || 'down'}` }, c.condition), c.drink ? [' ', h('span', { class: 'chip down' }, c.drink)] : null, ' ', h('span', { class: 'chip' }, (c.title || cap1(c.role)).toLowerCase())),
      skillRow(c.skills),
      traitChips(c.traits),
      bondChips(c.bonds),
      facts([
        ['Standing', cap1(c.standing)],
        c.alias ? ['Born', c.name] : null,
        ['Where', c.where === 'party' ? 'With the party' : c.whereName], ['Rest', cap1(c.fatigue)], c.drink ? ['Drink', cap1(c.drink)] : null, c.heavy ? ['Habit', 'A heavy drinker'] : null, c.heir ? ['Succession', 'Loyal enough to carry the revenge on'] : null, ['Terms', termsText(c)],
        c.role === 'sheriff' ? null : ['Mood', `${cap1(c.mood)}; loyalty ${c.loyalty}`],
        c.office ? ['Office', cap1(c.office.word)] : null,
        c.unpaid ? ['Owed', `${plural(c.unpaid, 'week', 'weeks')} of wages`] : null,
        c.cases ? ['Cases', `${c.cases} settled`] : null,
        c.injuries.length ? ['Wounds', c.injuries.map(injuryText).join('; ')] : null,
        ['Carries', c.loadout.map(weaponText).join(', ')],
        c.stowed.length ? ['In the office', c.stowed.map(weaponText).join(', ')] : null,
      ]));
    const row = h('div', { class: 'c-row' });
    if (present) {
      if (c.loadout.length > 1) c.loadout.forEach((w, i) => row.append(btn(`Stow the ${WEAPON_NAME[w.id] || w.id}`, () => {
        const r = call('carry', c.id, i, false);
        if (!r.ok) say(r.reason);
        draw();
      }, { cls: 'ghost', key: `leave-${c.id}-${i}` })));
      c.stowed.forEach((w, i) => row.append(btn(`Take the ${WEAPON_NAME[w.id] || w.id}`, () => {
        const r = call('carry', c.id, i, true);
        if (!r.ok) say(r.reason);
        draw();
      }, { cls: 'ghost', key: `take-${c.id}-${i}` })));
      if (c.role !== 'sheriff') row.append(btn('Let go', async () => {
        if (await confirm(`Let ${displayOf(c)} go?`, ['They leave the office for good. A dismissed deputy does your name no good.'], 'Let them go', 'Keep them', true)) {
          const r = call('dismiss', c.id);
          say(r.ok ? `${r.display || r.name} is let go.` : r.reason);
        }
        draw();
      }, { cls: 'danger', key: `dismiss-${c.id}` }));
    }
    if (row.childNodes.length) art.append(row);
    box.append(art);
  }
  return box;
}

function panelRest(v) {
  const box = h('section', { class: 'c-panel' }, panelHead('Rest'));
  box.append(hint('Bed and board in town; the stores are not touched. Wounds mend and tired hands recover. Wages still fall due.'));
  // Note: each choice carries what the party pays for it, a head at LODGING_CENTS_PER_DAY a day.
  const heads = Math.max(1, v.crew.filter((c) => c.where === 'party' || c.where === v.at).length);
  const row = h('div', { class: 'c-restrow' });
  for (const hrs of [1, 4, 8, 24]) {
    const cost = dollars(Math.round((LODGING_CENTS_PER_DAY * heads * hrs) / 24));
    row.append(bigBtn([h('b', {}, hrs === 24 ? 'A day' : plural(hrs, 'hour', 'hours')), h('small', {}, cost)], () => {
      const r = call('rest', hrs);
      if (r.ok && r.interrupted) {
        if (r.brawl) { say(`${r.brawl.targetName} is in a saloon fight.`); go('brawl'); }
        else { say(`${r.challenge.name} could not talk ${r.challenge.opponent.name} out of a duel.`); go('duel'); }
        return;
      }
      if (r.ok) say(`The party rests ${hrs === 24 ? 'a day' : plural(hrs, 'hour', 'hours')}.`);
      else {
        say(r.reason);
        cue('deny');
      }
      draw();
    }, { cls: hrs === 24 ? 'primary' : 'ghost', key: `rest-${hrs}`, aria: `Rest ${hrs === 24 ? 'a day' : plural(hrs, 'hour', 'hours')} for ${cost}` }));
  }
  box.append(row);
  return box;
}

const PANELS = {
  saloon: panelSaloon, board: panelBoard, ask: panelAsk, cases: panelCases, shop: panelShop, doctor: panelDoctor, recruit: panelRecruit, crew: panelCrew, rest: panelRest,
};

// Note: a place chosen in the list refocuses its row, a place chosen on the map keeps the focus on the map.
function selectDest(id, ref) {
  if (S.dest === id) return;
  S.dest = id;
  S.prep = null;
  S.refocus = ref || `dest-${id}`;
  S.focus = 'key';
  fx.clearToasts();
  draw();
}

// Note: items 172, 235: the picker and the map list only known places and never the whole list; prepare gives the party and its stores, prepareDestination the one chosen place.
function screenTravel(v) {
  const p = S.camp.prepare({ limit: 0 });
  if (!p.ok) {
    say(p.reason);
    S.screen = 'town';
    return screenTown(v);
  }
  const index = knownIndex(S.camp);
  const wagon = p.transport.kind === 'wagon';
  const dest = S.dest ? S.camp.prepareDestination(S.dest) : null;
  if (S.dest && !dest) S.dest = null;
  const entry = dest ? index.byId.get(dest.id) : null;
  const way = dest && dest.reachable ? routeTree(p.here, wagon) : null;
  const plan = way ? pathPoints(way.path(dest.id)) : null;
  const others = index.items.length > 1;
  const side = h('section', { class: 'c-side c-panel' }, panelHead('Where to?'),
    dest ? null : others ? hint('Only places you know of are shown. Choose one, then the party and what it carries.') : hint('You know of no other place yet. Read the board or ask around in town.'),
    dest && entry ? [previewPanel({ entry, dest, facts: previewFacts(S.camp.state, p.here, dest.id), mode: p.transport.kind }), dest.reachable ? prepForm(v, p, dest) : null] : others ? h('p', { class: 'c-pick' }, 'Choose a place on the map or in the list.') : null);
  const map = worldMap('travel', v, {
    selected: dest ? dest.id : null, plan, reveal: plan ? { key: dest.id, points: plan } : null, pick: (id) => { cue('tab'); selectDest(id, 'map'); },
  });
  return {
    split: true,
    nav: pickerNav({
      camp: S.camp, index, here: p.here, wagon, selected: dest ? dest.id : null, onPick: (id) => selectDest(id),
    }),
    head: pageHead('The West', `Map · ${p.here ? placeName(p.here) : ''}`),
    body: h('div', { class: 'c-split mv-split' }, map, side),
    foot: [
      footLeft(h('p', {}, dest ? (dest.reachable ? h('span', {}, h('b', {}, `${dest.name}: `), `${dest.km} km, about ${hoursText(dest.hours)}, ${dest.danger}.`) : h('span', {}, h('b', {}, `${dest.name}: `), 'no way there from here.')) : others ? 'Pick a place on the map, in the list, or by name.' : '')),
      bigBtn('← Back to town', () => go('town'), { cls: 'ghost', key: 'to-town', sfx: 'tab' }),
      bigBtn('Set out →', () => setOut(v, p, dest), {
        cls: 'primary', key: 'set-out', disabled: !dest || !dest.reachable, why: dest ? 'There is no way there from here.' : 'Choose a place first.', tip: null, sfx: 'none',
      }),
    ],
  };
}

function prepForm(v, p, dest) {
  if (!S.prep || S.prep.dest !== dest.id) {
    S.prep = {
      dest: dest.id,
      party: new Set(p.crew.filter((c) => c.here && c.willing && c.role !== 'sheriff').map((c) => c.id)),
      bring: { food: below(p.stock.food), water: below(p.stock.water), feed: below(p.stock.feed), '44-40': p.ammo['44-40'], '45colt': p.ammo['45colt'] },
    };
  }
  const prep = S.prep;
  const n0 = Math.max(1, p.crew.filter((c) => c.where === 'party').length);
  const form = h('form', { class: 'c-prep', 'aria-label': `Prepare to leave for ${dest.name}`, onsubmit: (e) => e.preventDefault() });
  const crew = h('fieldset', { class: 'c-fields' }, h('legend', {}, 'Who rides'));
  for (const c of p.crew) {
    const sheriff = c.role === 'sheriff';
    const off = !sheriff && (!c.here || !c.willing);
    const note = sheriff ? 'leads' : !c.here ? `in ${c.whereName}` : !c.willing ? 'will not ride just now' : `${c.condition}, ${c.fatigue}`;
    crew.append(h('label', { class: `c-check${off ? ' is-off' : ''}` },
      h('input', {
        type: 'checkbox', checked: sheriff || (prep.party.has(c.id) && !off), disabled: sheriff || off, 'data-key': `ride-${c.id}`,
        onchange: (e) => {
          if (e.target.checked) prep.party.add(c.id);
          else prep.party.delete(c.id);
          cue('tick');
          sync();
        },
      }), h('span', {}, h('b', {}, displayOf(c)), h('small', {}, ` ${note}`))));
  }
  form.append(crew);
  const sup = h('fieldset', { class: 'c-fields' }, h('legend', {}, 'What it carries'));
  const rows = [
    ['food', 'Rations', below(p.stock.food), p.capacity.food], ['water', 'Water (litres)', below(p.stock.water), p.capacity.water],
    ['feed', 'Feed', below(p.stock.feed), p.capacity.feed], ['44-40', `${AMMO_NAME['44-40']} cartridges`, p.ammo['44-40'], null], ['45colt', `${AMMO_NAME['45colt']} cartridges`, p.ammo['45colt'], null],
  ];
  for (const [k, label, have, cap] of rows) {
    if (k === 'feed' && p.transport.kind === 'foot') continue;
    // Note: supplies are carried in tenths, cartridges one by one.
    const rounds = k === '44-40' || k === '45colt';
    sup.append(h('label', { class: 'c-bring' }, h('span', {}, label),
      h('input', {
        type: 'number', min: '0', step: rounds ? '1' : '0.1', max: String(have), value: String(Math.min(prep.bring[k], have)), 'data-key': `bring-${k}`,
        onchange: (e) => {
          const raw = Number(e.target.value);
          const v = Number.isFinite(raw) ? raw : 0;
          prep.bring[k] = Math.max(0, Math.min(have, rounds ? Math.floor(v) : Math.round(v * 10) / 10));
          e.target.value = String(prep.bring[k]);
          sync();
        },
      }), h('small', {}, `of ${have}${cap != null ? ` · max ${cap}` : ''}`)));
  }
  form.append(sup);
  const need = h('p', { class: 'c-note c-need', role: 'status' });
  form.append(need);
  function sync() {
    const n = prep.party.size + 1;
    const days = dest.days;
    const feed = dest.needs.feed ? Math.ceil((dest.needs.feed / n0) * n) : 0;
    const bits = [`For ${plural(n, 'person', 'people')} the trip needs about ${n * days} rations, ${n * 3 * days} litres of water${feed ? ` and ${feed} feed` : ''}${dest.springs ? ' (springs on the way refill the water)' : ''}.`];
    const short = [];
    if (prep.bring.food < n * days) short.push('rations');
    if (prep.bring.water < n * 3 * days && !dest.springs) short.push('water');
    if (feed && prep.bring.feed < feed) short.push('feed');
    if (short.length) bits.push(`The party is short of ${short.join(' and ')} for the whole trip.`);
    need.textContent = bits.join(' ');
  }
  sync();
  return form;
}

const toneOf = (hour) => (hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 11 ? 'morning' : hour < 17 ? 'noon' : hour < 20 ? 'dusk' : 'night');
const TONE_WORD = { dawn: 'At dawn', morning: 'In the morning', noon: 'At midday', dusk: 'At dusk', night: 'By night' };

// Note: the departure title card: dawn or dusk colours, the station bell for the two, hoofbeats for all; any key or click ends it.
function departureCard(v, dest) {
  const d = dateOf(v.time.min);
  const tone = toneOf(d.hour);
  const bell = tone === 'dawn' || tone === 'dusk';
  return fx.card({
    tone,
    ms: 1900,
    lines: [{ text: 'Setting out' }, { text: `for ${dest.name}` }, { text: `${TONE_WORD[tone]} · ${d.label.slice(0, 3)} ${d.time}` }],
    cues: bell ? [['bell', 80], ['horse', 700]] : [['horse', 120]],
  });
}

async function setOut(v, p, dest) {
  const prep = S.prep;
  const party = [...prep.party];
  const r = call('depart', dest.id, {
    party,
    bring: { food: prep.bring.food, water: prep.bring.water, feed: prep.bring.feed, ammo: { '44-40': prep.bring['44-40'], '45colt': prep.bring['45colt'] } },
  });
  if (!r.ok) {
    say(r.reason);
    cue('deny');
    draw();
    return;
  }
  for (const x of r.refused || []) say(`${shown(x.name)} will not ride with the party.`);
  for (const w of r.warnings || []) say(w);
  const after = V();
  const left = ['food', 'water', 'feed'].filter((k) => prep.bring[k] > after.supplies.stock[k] + 0.01);
  if (left.length) say('More than the party can carry stayed behind in the office.');
  S.prep = null;
  S.trail = after.map.party ? [after.map.party] : [];
  S.screen = 'journey';
  S.focus = 'head';
  S.departures += 1;
  draw();
  await departureCard(after, dest);
}

function progressBar(j) {
  const pct = j.km ? Math.round((j.doneKm / j.km) * 100) : 0;
  return h('div', { class: 'c-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Distance covered' },
    h('i', { style: `transform:scaleX(${pct / 100})` }));
}

function screenJourney(v) {
  const j = v.journey;
  const pend = j.pending;
  const side = h('section', { class: 'c-jside c-panel' });
  side.append(panelHead(pend ? pend.title : 'The way ahead'),
    h('div', { class: 'c-jstatus' }, h('p', { class: 'c-note' }, `${j.doneKm} of ${j.km} km · ${v.time.daylight ? 'daylight' : 'night: riding on camps until dawn'}`)),
    progressBar(j),
    h('div', { class: 'c-slot' }, pend ? pendingCard(v, pend) : h('p', { class: 'c-quiet' }, 'The road is quiet.')),
    h('h3', { class: 'c-grp' }, 'Journal'),
    h('ol', { class: 'c-log', id: 'campLog', tabindex: '0', 'aria-label': 'Recent events' }, v.log.slice(-9).map((l) => h('li', {}, h('time', {}, stampOf(l.min)), ` ${l.text}`))));
  return {
    split: true,
    nav: [h('p', { class: 'c-nav-h' }, 'On the road'), roadControls(v, j, !!pend), h('i', { class: 'c-fill' }), medal()],
    head: pageHead('The road', `To ${j.toName}`),
    body: h('div', { class: 'c-split mv-split' }, worldMap('journey', v, {
      trail: S.trail, route: legPoints(S.camp.state.journey.legs), fit: legPoints(S.camp.state.journey.legs), selected: j.to, pick: pend || S.busy ? null : (id) => changeCourse(id),
    }), side),
    foot: [
      footLeft(h('p', {}, pend ? 'Decide before the party rides on.' : 'A click on the map changes course · Esc menu · M sound')),
      bigBtn('Journal', showJournal, { cls: 'ghost', key: 'journal', sfx: 'open' }),
      bigBtn('Menu', showMenu, { cls: 'ghost', key: 'menu', sfx: 'open' }),
    ],
  };
}

function roadControls(v, j, pending) {
  const off = pending || S.busy;
  const why = pending ? 'Settle what is happening first.' : 'Wait a moment.';
  const hours = h('select', { id: 'campRestHours', 'data-key': 'rest-hours', disabled: off }, [1, 2, 4, 8, 12].map((n) => h('option', { value: String(n) }, plural(n, 'hour', 'hours'))));
  // Note: only the nearest known places are listed; the map and the travel screen reach the rest.
  const others = v.map.party ? nearestKnown(knownIndex(S.camp), v.map.party.x, v.map.party.y, { limit: 30, skip: j.to }).map((f) => f.it) : [];
  const sel = others.length ? h('select', { id: 'campRedirect', 'data-key': 'redirect-to', disabled: off }, others.map((p) => h('option', { value: p.id }, p.name))) : null;
  const group = (title, ...kids) => h('div', { class: 'c-roadgrp', role: 'group', 'aria-label': title }, h('p', { class: 'c-nav-h' }, title), ...kids);
  return h('div', { class: 'c-roadbox' },
    bigBtn(v.time.daylight ? 'Ride on' : 'Camp till dawn', () => step(true), { cls: 'primary', key: 'ride', disabled: off, why, sfx: 'none' }),
    bigBtn(`Auto: ${S.auto ? 'on' : 'off'}`, toggleAuto, { cls: 'ghost', key: 'auto', pressed: S.auto ? 'true' : 'false', disabled: off, why, tip: S.auto ? 'Rides on by itself until something happens.' : 'Ride on by itself until something happens.' }),
    group('Rest', h('div', { class: 'c-pair' }, h('label', {}, h('span', { class: 'sr-only' }, 'Hours of rest'), hours),
      btn('Rest', () => roadRest(Number(hours.value)), { key: 'road-rest', disabled: off, why }))),
    group('Course',
      sel ? h('div', { class: 'c-pair' }, h('label', {}, h('span', { class: 'sr-only' }, 'Change course to'), sel),
        btn('Go', () => redirectTo(sel.value), { cls: 'ghost', key: 'redirect', disabled: off, why, aria: 'Change course to the chosen place' })) : null,
      btn(`Back to ${j.fromName}`, () => turnBack(), { cls: 'ghost', key: 'turn-back', disabled: off, why })));
}

// Note: item 157: the ground is named in the words of the country the party rides through, as the road text is.
const groundName = (terrain, v = V()) => (TERRAINS[terrain] ? terrainLabel(terrain, v.region && v.region.id) : null);

// Note: the text scrolls inside its own box and the two buttons stay pinned under it, so a longer text (the ambush line, the driven-off line) never pushes them or clips them.
function pendingCard(v, p) {
  const card = h('div', { class: 'c-event', role: 'group', 'aria-label': p.title });
  const body = h('div', { class: 'c-event-body' });
  card.append(body);
  const terrain = groundName(p.terrain, v);
  body.append(h('p', { class: 'c-text' }, p.text));
  if (terrain) body.append(h('p', { class: 'c-note' }, `The ground here: ${terrain}.`));
  if (p.kind === 'choice') {
    for (const o of p.options) {
      const poor = o.needs && o.needs.cents > v.money.cents;
      body.append(h('div', { class: 'c-opt' },
        bigBtn(o.label, () => choose(o.id), { key: `opt-${o.id}`, disabled: poor, why: 'You cannot afford it.', cls: 'primary' }),
        o.hint ? h('small', {}, o.hint) : null));
    }
    return card;
  }
  if (p.ambush) body.append(h('p', { class: 'c-alert' }, 'They have the drop on the party.'));
  if (p.retreated) body.append(h('p', { class: 'c-note' }, 'You were driven off once; they are on their guard.'));
  const cannotSlip = p.forced && p.ambush;
  card.append(h('div', { class: 'c-row c-event-act' },
    bigBtn('Engage', () => engage(), { cls: 'danger', key: 'engage' }),
    bigBtn('Withdraw', () => withdraw(), {
      cls: 'ghost', key: 'withdraw', disabled: cannotSlip, why: 'There is no slipping away from this.', tip: cannotSlip ? null : 'Costs time and may not work; if they see the party, the fight begins on their terms.',
    })));
  return card;
}

function stopAuto() {
  clearTimeout(S.timer);
  S.timer = 0;
}

// Note: busy only shows as disabled road controls, so clearing it redraws them; setting it needs no redraw under a dialog.
function setBusy(on) {
  const was = S.busy;
  S.busy = on;
  if (was && !on && S.camp && S.screen === 'journey') draw();
}

function toggleAuto() {
  S.auto = !S.auto;
  S.refocus = 'auto';
  S.focus = 'key';
  draw();
  autoLoop();
}

function autoLoop() {
  stopAuto();
  if (!S.auto || S.screen !== 'journey' || S.busy || S.modal || document.hidden) return;
  S.timer = setTimeout(async () => {
    await step(false);
    autoLoop();
  }, 420);
}

// Note: what one move on the road did; arrival and a waiting case end the auto-continue, as does anything the player should see.
async function afterMove(r) {
  const v = V();
  if (v.map.party && v.journey) S.trail.push(v.map.party);
  if (r.type !== 'progress' && r.type !== 'rested') S.auto = false;
  if ((r.events || []).some((e) => ['shortage', 'death', 'succession', 'left', 'board-unpaid'].includes(e.type))) S.auto = false;
  if (r.type === 'arrived' || r.type === 'case') {
    say(`The party reaches ${placeName(r.at)}.`);
    S.screen = 'town';
    S.tab = 'cases';
    draw();
    await arrivalCard(r.at);
  } else if (r.type === 'progress' && r.camp) say('The party camps through the night.');
  else if (r.type === 'rested') say(`The party rests ${plural(r.hours, 'hour', 'hours')}.`);
  draw();
  if (r.type === 'case') await openCases(r.caseIds);
}

async function step(manual) {
  if (S.busy || S.modal || !S.camp.view().journey) return;
  if (manual) cue('horse');
  const r = call('advance', 60);
  await afterMove(r);
}

async function roadRest(hrs) {
  const r = call('restOnRoad', hrs);
  if (!r.ok) {
    say(r.reason);
    cue('deny');
    draw();
    return;
  }
  await afterMove(r);
}

function turnBack() {
  S.auto = false;
  const r = call('turnBack');
  if (!r.ok) {
    say(r.reason);
    cue('deny');
  } else if (r.type === 'arrived' || r.type === 'case') say('The party is back where it started.');
  else say(`The party turns back. ${r.km} km to go${r.hours > 0 ? `, about ${hoursText(r.hours)}` : ''}.`);
  draw();
  // Note: item 314: arriving by turning back is an arrival too.
  const arrived = r.ok && (r.type === 'arrived' || r.type === 'case') ? arrivalCard(r.at) : Promise.resolve();
  if (r.type === 'case') arrived.then(() => openCases(r.caseIds));
}

// Note: a click on a place of the road map asks first; the course changes only on Yes.
async function changeCourse(id) {
  const now = S.camp.view().journey;
  if (!now || id === now.to || S.busy || S.modal) return;
  if (await confirm('Change course?', [`Ride for ${placeName(id)} instead of ${now.toName}?`], 'Change course', 'Stay on course')) redirectTo(id);
}

function redirectTo(id) {
  S.auto = false;
  const r = call('redirect', id);
  if (!r.ok) {
    say(r.reason);
    cue('deny');
  } else if (r.type) say(`The party arrives at ${placeName(r.at)}.`);
  else say(`The party changes course for ${placeName(id)}: ${r.km} km${r.hours > 0 ? `, about ${hoursText(r.hours)}` : ''}.`);
  const view = V();
  if (view.map.party && view.journey) S.trail.push(view.map.party);
  draw();
  const arrived = r.ok && r.type ? arrivalCard(r.at) : Promise.resolve();
  if (r.type === 'case') arrived.then(() => openCases(r.caseIds));
}

function choose(optionId) {
  const r = call('choose', optionId);
  if (!r.ok) {
    say(r.reason);
    cue('deny');
  } else {
    say(r.text);
    if (r.changes && r.changes.length) say(`(${r.changes.join(', ')})`);
    if (r.learned) say(`${placeName(r.learned)} is now on your map.`);
    if (r.fight) say('The men will not be talked round.');
  }
  draw();
}

async function engage() {
  const e = call('engage');
  if (!e.ok) {
    say(e.reason);
    cue('deny');
    draw();
    return;
  }
  await fight({ id: e.encounter.id }, 'road', { title: e.encounter.title, text: e.encounter.text, facts: [['Where', groundName(e.encounter.terrain)]] });
}

async function withdraw() {
  const r = call('withdraw');
  if (!r.ok && !r.escaped) {
    say(r.reason);
    cue('deny');
    draw();
    return;
  }
  if (r.escaped) {
    say(r.text || 'The party slips away.');
    draw();
    return;
  }
  draw();
  if (r.forced && r.encounter) {
    await info('Seen', [r.text, 'The fight comes anyway, on their terms.'], 'Take your places', 'Withdrawal failed', { cue: 'hurt' });
    await fight({ id: r.encounter.id }, 'road', { title: r.encounter.title, text: r.encounter.text, facts: [] });
  }
}

async function goToCase(caseId) {
  const c = S.camp.case(caseId);
  if (!c) return;
  await fight(caseId, 'case', { title: c.title, text: c.text, facts: [['The site', c.site], ['Danger', c.danger], ['The men', c.men]] });
}

const openCases = (ids) => openHere(ids || [], []);

// Note: one choice of everything waiting in a town: each case to go to, then each lead whose source is here to seek; a single one is taken at once.
async function openHere(ids, leads) {
  if (ids.length + leads.length === 0) return;
  if (ids.length + leads.length === 1) {
    if (ids.length) await goToCase(ids[0]);
    else seekLead(leads[0]);
    return;
  }
  const head = !leads.length ? 'More than one case waits here' : !ids.length ? 'More than one lead points here' : 'Cases and leads here';
  const pick = await modal((close) => h('div', { class: 'c-dlg' },
    dialogHead(head, 'The party has arrived'),
    h('p', { class: 'c-text' }, ids.length ? 'Choose which to take on first. The others will wait.' : 'Choose whom to seek first. The others will wait.'),
    h('div', { class: 'c-stack' }, [
      ...ids.map((id, i) => {
        const c = S.camp.case(id);
        return bigBtn(c ? c.title : id, () => close({ case: id }), { cls: 'primary', autofocus: i === 0, key: `here-case-${id}` });
      }),
      ...leads.map((c, i) => bigBtn(`Seek ${c.lead.source}`, () => close({ lead: c }), { cls: ids.length ? 'ghost' : 'primary', autofocus: !ids.length && i === 0, key: `here-seek-${c.id}`, tip: `About ${c.title}` })),
    ]),
    h('div', { class: 'actions' }, bigBtn('Not now', () => close(null), { cls: 'ghost' }))));
  if (pick?.case) await goToCase(pick.case);
  else if (pick?.lead) seekLead(pick.lead);
}

// Note: the whole attempt, from team selection to the result sheet; the loop repeats for a retry with the team chosen again (items 156, 169).
async function fight(source, kind, about) {
  setBusy(true);
  stopAuto();
  try {
    for (;;) {
      const picked = await chooseTeam(source, kind, about);
      // Note: item 486: a planned fight in the open asks which side to go in from; an ambush starts where the party was riding.
      const spec = picked && picked.approach && picked.approach.choose ? await chooseSide(picked, about) : picked;
      if (!spec) {
        call('cancelEncounter');
        draw();
        return;
      }
      const before = V();
      const out = await playScene(spec);
      if (!out) {
        call('cancelEncounter');
        draw();
        return;
      }
      const res = finishScene(S.camp, out.sim, spec, out.pulled ? { result: 'failure', reason: 'the party pulled out' } : null);
      persist();
      news(res.events || [], ['death', 'succession', 'ended']);
      S.holdGrief = true;
      grieve(fightDeaths(res), res.events && res.events.length ? res.events : [res.succession].filter(Boolean));
      beats(res.events);
      showCamp();
      const after = V();
      draw();
      const again = await resultSheet(res, out.sim.report(), before, after, kind);
      S.holdGrief = false;
      draw();
      if (after.ended || !res.ok || !res.retry || again !== 'retry') return;
    }
  } finally {
    S.holdGrief = false;
    setBusy(false);
    autoLoop();
  }
}

function teamRow(c, on) {
  const unfit = !c.fit;
  const sullen = c.mood === 'sullen';
  const off = unfit || sullen;
  const note = unfit ? 'too badly hurt to go in' : sullen ? 'will not go in' : `${c.condition}, ${c.fatigue}`;
  return h('label', { class: `c-check${off ? ' is-off' : ''}` },
    h('input', { type: 'checkbox', checked: on && !off, disabled: off, value: c.id, 'data-key': `team-${c.id}` }),
    h('span', {}, h('b', {}, displayOf(c)), h('small', {}, ` ${note}`)));
}

// Note: the spec of a road fight with the whole riding party; a short supply of cartridges is still asked about.
async function roadSpec(source) {
  const spec = call('encounterSpec', source);
  if (!spec.ok) {
    say(spec.reason);
    return null;
  }
  if (spec.warnings && spec.warnings.length && !(await confirm('Short of cartridges', spec.warnings.concat('The party can still fight.'), 'Fight anyway', 'Back'))) return null;
  return spec;
}

// Note: item 486: the four entry sides, with only what the party already knows (its earlier entries), never the ground or the men unseen.
async function chooseSide(spec, about) {
  const ap = spec.approach;
  const notes = Array.isArray(ap.known) ? ap.known : [];
  const names = { n: 'From the north', e: 'From the east', s: 'From the south', w: 'From the west' };
  const side = await modal((close) => h('div', { class: 'c-dlg' },
    dialogHead('Which way in?', about && about.title ? about.title : 'Approach'),
    h('p', { class: 'c-text' }, 'Choose the side the party comes in from. The ground beyond is not known until the party sees it, and no side is promised to be safe.'),
    notes.length ? h('ul', { class: 'c-text' }, notes.map((t) => h('li', {}, t))) : null,
    h('div', { class: 'c-stack', role: 'group', 'aria-label': 'Entry side' }, ap.sides.map((x) => bigBtn(x === ap.best ? `${names[x] || x}: their blind side` : names[x] || x, () => close(x), { cls: x === ap.side ? 'primary' : '', key: `side-${x}`, autofocus: x === ap.side }))),
    h('div', { class: 'actions' }, bigBtn('Back', () => close(null), { cls: 'ghost' }))));
  return side ? withSide(spec, side) : null;
}

// Note: the team is checked here (up to the limit of the crew's standing, only fit and willing hands); encounterSpec is called once per confirmation.
async function chooseTeam(source, kind, about) {
  let err = null;
  let last = null;
  for (;;) {
    const v = V();
    // Note: item 320: on the road everyone riding with the sheriff is in the fight, so there is no team to choose.
    if (kind !== 'case') return roadSpec(source);
    const MAX_TEAM = v.limits.encounter;
    const sheriff = v.crew.find((c) => c.role === 'sheriff');
    const pool = v.crew.filter((c) => c.role !== 'sheriff' && (kind === 'case' ? c.where === v.at || c.where === 'party' : c.where === 'party'));
    const ids = await modal((close) => {
      const boxes = [];
      const count = h('p', { class: 'c-note', role: 'status' });
      const okBtn = bigBtn(kind === 'case' ? 'Go in' : 'Take your places', () => close(boxes.filter((b) => b.checked).map((b) => b.value)), { cls: 'danger', key: 'team-go' });
      const sync = () => {
        const n = boxes.filter((b) => b.checked).length;
        for (const b of boxes) if (!b.checked && !b.closest('.is-off')) b.disabled = n >= MAX_TEAM;
        count.textContent = `${n} of ${MAX_TEAM} teammates chosen. The sheriff always goes in.`;
      };
      const rows = pool.map((c) => {
        const row = teamRow(c, last ? last.includes(c.id) : pool.filter((x) => x.fit && x.mood !== 'sullen').slice(0, MAX_TEAM).includes(c));
        const box = row.querySelector('input');
        box.addEventListener('change', () => {
          cue('tick');
          sync();
        });
        boxes.push(box);
        return row;
      });
      const body = h('div', { class: 'c-dlg' },
        dialogHead(about.title, kind === 'case' ? 'A case' : 'Armed men on the road'),
        h('p', { class: 'c-text' }, about.text),
        about.facts && about.facts.length ? facts(about.facts) : null,
        err ? h('p', { class: 'c-alert', role: 'alert' }, err) : null,
        h('fieldset', { class: 'c-fields' }, h('legend', {}, 'Who goes in'),
          h('p', { class: 'c-check is-fixed' }, h('span', {}, h('b', {}, sheriff ? displayOf(sheriff) : 'The sheriff'), h('small', {}, ` leads, ${sheriff ? sheriff.condition : ''}`))),
          rows.length ? rows : h('p', { class: 'c-empty' }, 'No one else is with the party; the sheriff goes in alone.')),
        count,
        h('div', { class: 'actions' }, okBtn, bigBtn(kind === 'case' ? 'Not now' : 'Back', () => close(null), { cls: 'ghost', autofocus: true })));
      sync();
      return body;
    });
    if (!ids) return null;
    last = ids;
    if (ids.length > MAX_TEAM) {
      err = `At most ${MAX_TEAM} teammates can go in with the sheriff at the crew's present standing.`;
      continue;
    }
    const spec = call('encounterSpec', source, ids);
    if (!spec.ok) {
      err = spec.reason;
      continue;
    }
    err = null;
    if (spec.warnings && spec.warnings.length) {
      const go = await confirm('Short of cartridges', spec.warnings.concat('The party can still go in.'), 'Go in anyway', 'Change the team');
      if (!go) continue;
    }
    return spec;
  }
}

// Note: the menu sounds stop for a tactical scene, and the mute choice made in either place carries over to the other.
function syncMute(from) {
  const audio = S.app && S.app.audio;
  if (!audio || !audio.isMuted) return;
  if (from === 'camp') audio.setMuted(sfx.isMuted());
  else sfx.setMuted(audio.isMuted());
  const b = $('mute');
  if (b) b.textContent = audio.isMuted() ? 'Sound: off' : 'Sound: on';
}

async function playScene(spec) {
  const loading = $('campLoading');
  loading.classList.remove('is-hidden');
  // Note: lets the note paint before the ground is laid out.
  await new Promise((r) => setTimeout(r, 40));
  let sim;
  try {
    sim = buildSim(spec);
  } catch (err) {
    loading.classList.add('is-hidden');
    say(`The ground could not be laid out: ${err.message}`);
    return null;
  }
  syncMute('camp');
  sfx.suspend();
  S.sceneOn = true;
  loading.classList.add('is-hidden');
  $('camp').classList.add('is-hidden');
  const out = await new Promise((resolve) => {
    S.app.playCampaign(sim, (s, how) => resolve({ sim: s, pulled: how === 'pull' }), { pull: 'Pull out' });
    // Note: the scene audio is created by the first scene, so the mute choice is passed on once more after the start.
    syncMute('camp');
  });
  S.sceneOn = false;
  sfx.resume();
  syncMute('scene');
  return out;
}

const FATIGUE_ORDER = ['rested', 'tired', 'weary', 'exhausted'];

// Note: the name a crew member goes by on screen, found by the plain name the sim and the reports use.
function shown(name) {
  const v = S.view;
  const c = v && (v.crew.find((x) => x.name === name) || v.fallen.find((x) => x.name === name));
  return c ? displayOf(c) : name;
}

// Note: the sheet reports the fight, its costs, and who improved (item 463).
function resultSheet(res, rep, before, after, kind) {
  if (!res.ok) return info('No report', [res.reason], 'Close');
  const win = res.success;
  const pulled = rep.reason === 'the party pulled out';
  const verdict = pulled ? 'The party pulled out' : win ? (kind === 'case' ? 'The case is settled' : 'The road is clear') : 'The attempt failed';
  const lines = [];
  const add = (title, items) => items.length && lines.push(h('section', { class: 'c-res' }, h('h3', { class: 'c-grp' }, title), h('ul', { class: 'ledger' }, items)));
  add('Dead', res.deaths.map((d) => h('li', { class: 'entry is-dead' }, h('span', { class: 'who' }, shown(d.name)), h('span', { class: 'chip dead' }, 'dead'), h('span', { class: 'detail' }, d.cause))));
  add('Hurt', res.injuries.map((i) => h('li', { class: 'entry is-down' }, h('span', { class: 'who' }, shown(i.name)), h('span', { class: 'chip down' }, i.serious ? 'badly hurt' : 'hurt'))));
  const lost = (res.lostWeapons || []).map((l) => `${shown(l.name)} lost ${l.weapons.map((w) => WEAPON_NAME[w] || w).join(' and ')}.`);
  // Note: item 366: what was picked up from the fallen goes to the law.
  if (res.handedOver && res.handedOver.length) lost.push(`Handed over to the law: ${res.handedOver.join(', ')}.`);
  const money = [];
  if (res.rewardCents) money.push(`${win && kind === 'case' ? 'Paid' : 'Taken off them'}: ${dollars(res.rewardCents)}.`);
  for (const x of res.hires || []) money.push(`${shown(x.name)} finishes the case${x.paid ? ` and is paid ${dollars(x.paid)}` : ' and moves on'}.`);
  if (res.learned) money.push(`Word of ${placeName(res.learned)} reaches you.`);
  // Note: items 463, 473: who grew in which skill, or plainly that no one did.
  const gains = res.gains;
  add('What they learned', gains.length
    ? gains.map((g) => h('li', { class: 'entry is-fine' }, h('span', { class: 'who' }, shown(g.name)), h('span', { class: 'chip good' }, glyph(g.glyph), ` ${g.label}`), h('span', { class: 'detail' }, !g.grew ? `${g.label} is already at its peak.` : g.before === g.after ? `${g.label} grew a little; still ${g.after}.` : `${g.label} grew from ${g.before} to ${g.after}.`)))
    : [h('li', { class: 'entry' }, h('span', { class: 'detail' }, 'No one learned anything new from this.'))]);
  const tired = after.crew.filter((c) => before.crew.some((b) => b.id === c.id && FATIGUE_ORDER.indexOf(c.fatigue) > FATIGUE_ORDER.indexOf(b.fatigue)) && c.fatigue !== 'rested');
  const notes = [];
  if (tired.length) notes.push(`${tired.map(displayOf).join(', ')} ${tired.length === 1 ? 'is' : 'are'} worn from the fight.`);
  else if (after.crew.some((c) => c.fatigue === 'weary' || c.fatigue === 'exhausted')) notes.push('The crew is worn out and needs rest.');
  if (res.succession && res.succession.kind !== 'ended') notes.push(successionText(res.succession));
  if (res.ended) notes.push(res.ended.reason);
  if (res.retry && !res.ended) notes.push(kind === 'case' ? 'The case is still open. You may try again with a team chosen anew.' : 'The men are still there. You may try again or withdraw.');
  const stamps = h('div', { class: 'stamps', 'aria-hidden': 'true' }, h('div', { class: `stamp ${win ? 'win' : 'loss'}`, style: '--delay:.25s' }, win ? 'Cleared' : pulled ? 'Withdrawn' : 'Lost'));
  return modal((close) => h('div', { class: 'c-dlg c-result' },
    h('div', { class: 'head' }, h('div', { class: 'head-text' }, h('p', { class: 'banner' }, win ? 'Success' : 'Failure'), h('h2', { class: 'c-title', id: 'campDialogH', tabindex: '-1' }, verdict),
      h('p', { class: 'lede' }, `${sentence(res.reason)} ${rep.hostilesDown} of ${rep.hostilesTotal} down in ${hoursText(res.minutes / 60)}.`)), stamps),
    lines,
    money.length ? h('ul', { class: 'c-flash' }, money.map((m) => h('li', {}, m))) : null,
    lost.length ? h('ul', { class: 'c-flash' }, lost.map((m) => h('li', {}, m))) : null,
    notes.length ? h('ul', { class: 'c-notes' }, notes.map((m) => h('li', {}, m))) : null,
    h('div', { class: 'actions' },
      res.retry && !res.ended ? bigBtn('Try again: choose the team', () => close('retry'), { cls: 'danger', key: 'again' }) : null,
      bigBtn(res.ended ? 'Continue' : res.retry ? (kind === 'case' ? 'Back to town' : 'Back to the road') : 'Continue', () => close('done'), { cls: 'primary', autofocus: true }))),
  // Note: item 328: a won scene that left wounds sounds the wound cue after the victory.
  { cue: win ? 'victory' : 'hurt', after: (body, close, later) => { later(() => cue('stamp'), 250); if (win && res.injuries.length) later(() => cue('hurt'), 700); } });
}

const fallenOf = (name) => {
  const list = V().fallen;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].name === name) return list[i];
  return null;
};

// Note: a place is named only when it is on the map; anything else reads as the open country (items 142, 172); a death between towns names the road's end.
function whereText(where, road = false) {
  const p = where && PLACES[where] && S.camp && isKnown(S.camp.state, where) ? PLACES[where] : null;
  return !p ? 'out on the trail' : road ? `on the road to ${p.name}` : `in ${p.name}`;
}

// Note: the books of one death: the fallen entry of the campaign, by id when the entry has one.
const recordOf = (d) => {
  const list = S.camp ? S.camp.state.fallen : [];
  for (let i = list.length - 1; i >= 0; i--) if (d.charId != null ? list[i].char.id === d.charId : list[i].char.name === d.name) return list[i];
  return null;
};
const griefRole = (d) => d.role || (recordOf(d) || { char: {} }).char.role || null;

// Note: item 314: a newly found lead about the nemesis gets a short dramatic beat with the one lead cue (item 342).
function beats(events) {
  for (const ev of events || []) {
    // HACK: a lead found on arriving waits one timer turn, so afterMove queues the town's own vignette first (item 314).
    if (ev.type === 'lead') setTimeout(() => leadBeat(ev.lead), 0);
    // Note: item 338: taking an associate alive sounds as handcuffs clicking shut.
    if (ev.type === 'captured') cue('cuffs');
  }
}

// Note: item 383: where the word came from, then the man it names beside the map; a questioned associate is shown by portrait only.
const SOURCE_TEXT = {
  case: () => 'From the papers of a settled case',
  saloon: (v) => `Talk at a saloon table in ${v.atName}`,
  road: () => 'A traveller met on the road',
  questioned: (v, a) => `${a ? a.name : 'An associate'}, taken alive and questioned`,
  body: (v, a) => `Found on ${a ? `${a.name}'s` : 'the'} body`,
  belongings: (v, a) => `Among ${a ? `${a.name}'s` : 'his'} belongings`,
  witness: (v, a) => `Witnesses who knew ${a ? a.name : 'him'}`,
};
function leadBeat(lead) {
  const v = V();
  const st = v.story;
  const assoc = lead.associateId ? st.associates.find((a) => a.id === lead.associateId) : null;
  const named = lead.kind === 'associate' && assoc ? { portrait: assoc.portrait, name: assoc.name } : nemesisOf(st);
  const learned = lead.text.includes(': ') ? lead.text.slice(lead.text.indexOf(': ') + 2) : lead.text;
  return stage(leadScene({
    source: lead.source,
    sourceText: (SOURCE_TEXT[lead.source] || (() => 'Word on the trail'))(v, assoc),
    subject: named,
    associateOf: lead.kind === 'associate' && assoc ? nemesisOf(st).name : null,
    associate: assoc ? { portrait: assoc.portrait, name: assoc.name } : null,
    place: PLACES[lead.place] ? PLACES[lead.place].name : '',
    learned,
    date: lead.date,
  }));
}

// Note: the dead of one call go to the queue with their role and, for a sheriff, the succession event that followed; flushGrief shows them.
function grieve(deaths, events) {
  for (const d of pairGrief(deaths, events, griefRole)) S.grief.push(d);
}

// Note: the dead named by the result and those the clock took during the fight, each once.
function fightDeaths(res) {
  const out = (res.deaths || []).slice();
  for (const e of res.events || []) if (e.type === 'death' && !out.some((x) => x.charId === e.charId)) out.push(e);
  return out;
}

// Note: the place and the time come from the campaign's books, and only a fallen person on the books has them.
const ripOf = (d, f) => ripText({ title: f && f.title, cause: d.cause || (f && f.cause), where: f ? whereText(f.where, f.road) : '', when: f ? stampOf(f.min) : '' });

// Note: the crew at a grave: everyone of the office still alive, who stands there hats in hand (items 389, 390).
const mourners = (d) => V().crew.filter((c) => c.name !== d.name && c.charId !== d.charId).map((c) => person(c)).filter(Boolean);

// Note: item 389: the fallen with one low toll, then the surviving crew at the grave.
function mournCrew(d, f) {
  const who = (f && f.display) || d.display || d.name;
  return stage(crewDeathScene({ fallen: { portrait: f && f.portrait, name: who }, how: ripOf(d, f), survivors: mourners(d), date: markOf(f ? f.min : S.camp.state.min) }));
}

// Note: item 390: the fallen sheriff, darker, with three tolls; the crew at the grave; the star lifted for a successor or left on the marker.
function mournSheriff(d, f) {
  const who = (f && f.display) || d.display || d.name;
  const successor = !!(d.succession && d.succession.kind === 'deputy-promoted');
  return stage(sheriffDeathScene({ fallen: { portrait: f && f.portrait, name: who }, how: ripOf(d, f), crew: mourners(d), date: markOf(f ? f.min : S.camp.state.min), successor }));
}

function mourn(d) {
  const f = fallenOf(d.name);
  return griefRole(d) === 'sheriff' ? mournSheriff(d, f) : mournCrew(d, f);
}

let mourning = false;

// Note: one card at a time, the crew first and the sheriff last, the crew skipped when the sheriff is among them (item 389); the queue is read fresh each time, so a reset of S.grief stops the loop.
async function flushGrief() {
  if (mourning) return;
  mourning = true;
  try {
    while (S.grief.length) {
      // Note: the user's direction: the sheriff's death replaces the crew's grave scenes of the same queue.
      const keep = skipCrewForSheriff(S.grief, griefRole);
      if (keep.length !== S.grief.length) S.grief.splice(0, S.grief.length, ...keep);
      const [d] = S.grief.splice(pickGrief(S.grief, griefRole), 1);
      await mourn(d);
      // Note: item 313: a succession is a swearing in too.
      const next = d.succession && d.succession.kind === 'deputy-promoted' && V().crew.find((c) => c.id === d.succession.sheriffId);
      if (next) await swearSuccessor(next);
    }
  } finally {
    mourning = false;
  }
}

// Note: items 373, 395: every staged scene plays as panels; a frequent scene seen before in this campaign shows only its key panel, and the campaign remembers what it has seen.
function stage(scene, o = {}) {
  const st = !o.quick && S.camp ? S.camp.state : null;
  const seen = !!(st && st.staged && st.staged[scene.kind]);
  if (st && !seen && !scene.final && REPEATS.includes(scene.kind)) {
    st.staged = { ...(st.staged || {}), [scene.kind]: true };
    persist();
  }
  return playStory(staged(scene, o.quick ? false : seen), {
    h, modal, cue,
    say: (text, role, id) => sfx.say(text, role, id),
    hush: () => sfx.hush && sfx.hush(),
    choices: o.choices,
    onChoice: o.onChoice,
  });
}

// Note: the oath of office as an 1881 territory or county sheriff or deputy would have sworn it.
const oathText = (role, place) => `I do solemnly swear that I will support the Constitution of the United States and the laws of this ${place}, and that I will faithfully discharge the duties of the office of ${role}, so help me God.`;
const oathFor = (role) => oathText(role, ((PLACES[V().at] || {}).jur || '').endsWith('_terr') ? 'Territory' : 'State');

// Note: items 313, 381: a new deputy is sworn on the boardwalk before the townsfolk, and the sheriff pins the star.
function swearIn(c) {
  const sheriff = V().crew.find((m) => m.role === 'sheriff');
  return stage(deputyScene({ sheriff: person(sheriff), deputy: person(c), oath: oathFor('deputy') }));
}

// Note: item 380: a successor swears the oath, takes the star, vows revenge before every fallen sheriff, and knows the trail.
function swearSuccessor(c) {
  const v = V();
  const st = v.story;
  const fallen = [{ portrait: st.murder.portrait, name: `Sheriff ${st.murder.sheriff}` }, ...v.fallen.filter((f) => f.role === 'sheriff').map((f) => person(f))].filter(Boolean);
  const last = st.leads[0];
  return stage(successionScene({ who: person(c), oath: oathFor('sheriff'), fallen, nemesis: nemesisOf(st), place: st.finalAt, lastLead: last ? last.text : null }));
}

// Note: items 271, 293, 300, 378, 379: the opening: the window, the glimpse, the office, the star and the face; the deputy takes up the star without an oath.
function showOpening(v) {
  const st = v.story;
  const me = v.crew.find((c) => c.role === 'sheriff');
  return stage(openingScene({
    deputy: { portrait: me.portrait, name: displayOf(me) },
    sheriffLook: me.portrait.look,
    nemesis: nemesisOf(st),
    murdered: { portrait: st.murder.portrait, name: st.murder.sheriff },
    town: v.atName,
    date: v.time.label,
    funds: v.money.text,
    // Note: the murder happens at night, so the shot through the window and the ride away share one night; the face is the next dawn.
    mood: 'night',
  }));
}

// Note: item 273: the journal holds the hunt (the murder, the man, the associates and the leads found, newest first) above the campaign log; nothing undiscovered is shown.
function huntSection(st) {
  if (!st) return null;
  return h('section', { class: 'c-hunt', 'aria-label': 'The hunt' },
    h('div', { class: 'c-hunt-head' },
      face(st.nemesis.portrait, 'is-nemesis', st.nemesis.label),
      h('div', {},
        h('h3', { class: 'c-grp' }, st.nemesis.dead ? `${st.nemesis.label}, dead` : `Wanted: ${st.nemesis.label}`),
        h('p', { class: 'c-text' }, `Shot Sheriff ${st.murder.sheriff} dead at ${st.murder.at}. ${st.nemesis.motive}`),
        h('p', { class: 'c-traits' }, st.nemesis.traits.join('; ')),
        st.finalAt ? h('p', { class: 'c-alert' }, `Gone to ground at ${st.finalAt}.`) : null,
        st.associates.length ? h('div', { class: 'c-assoc' }, st.associates.map((a) => face(a.portrait, a.status === 'dead' ? 'is-fallen' : '', `${a.name} (${ASSOC_WORD[a.status] || a.status})`))) : null)),
    st.leads.length
      ? h('ol', { class: 'c-leads' }, st.leads.map((l) => h('li', {}, h('time', {}, l.date), ` ${l.text}`)))
      : h('p', { class: 'c-empty' }, 'No word of him yet.'));
}

const ASSOC_WORD = { free: 'at large', case: 'wanted', captured: 'taken', dead: 'dead' };

function showJournal() {
  const v = V();
  const dispatches = S.history.slice(-4).reverse();
  return info('Journal', [
    huntSection(v.story),
    h('h3', { class: 'c-grp' }, 'Log'),
    h('ol', { class: 'c-log tall', tabindex: '0', 'aria-label': 'Journal' }, v.log.slice().reverse().map((l) => h('li', {}, h('time', {}, stampOf(l.min)), ` ${l.text}`))),
    dispatches.length ? h('h3', { class: 'c-grp' }, 'Recent dispatches') : null,
    dispatches.length ? h('ul', { class: 'c-history' }, dispatches.map((x) => h('li', {}, `${stampOf(x.min)} · ${x.text}`))) : null,
  ], 'Close', `${v.time.label}`, { cls: 'is-journal' });
}

async function showMenu() {
  setBusy(true);
  stopAuto();
  const what = await modal((close) => {
    const sound = bigBtn(`Sound: ${sfx.isMuted() ? 'off' : 'on'}`, () => {
      toggleSound();
      sound.textContent = `Sound: ${sfx.isMuted() ? 'off' : 'on'}`;
    }, { cls: 'ghost', key: 'menu-sound', sfx: 'none' });
    return h('div', { class: 'c-dlg' },
      dialogHead('Menu', `Campaign No. ${S.camp.view().seed}`),
      h('p', { class: 'c-text c-center' }, 'The campaign is saved in this browser after every action.'),
      h('div', { class: 'c-stack' },
        bigBtn('Resume', () => close('resume'), { cls: 'primary', autofocus: true }),
        sound,
        bigBtn('About this frontier', () => close('about'), { cls: 'ghost' }),
        bigBtn('Leave to the title', () => close('title'), { cls: 'ghost' })));
  });
  if (what === 'title') {
    S.busy = false;
    leaveToTitle();
    return;
  }
  setBusy(false);
  if (what === 'about') await showAbout();
  else autoLoop();
}

// Note: item 176: what was read, what was checked and how, what is inferred and what is invented, as the code states it.
function showAbout() {
  const r = research();
  // Note: the address is plain text, never a link, so nothing opens during play.
  const sourceItem = (s) => h('li', {}, h('b', {}, s.label), `: ${s.use} `, h('span', { class: 'c-url', style: 'overflow-wrap: anywhere' }, s.url));
  const src = r.sources.map(sourceItem);
  const recalled = r.recalled.map(sourceItem);
  const checks = r.checks.map((c) => h('li', {}, h('b', {}, `${c.what}. `), c.how));
  return modal((close) => h('div', { class: 'c-dlg' },
    dialogHead('About this frontier', 'Sources'),
    h('p', { class: 'c-text' }, `${r.boundary.name}. The campaign begins on ${r.start}, in a town drawn at random. ${r.boundary.note}`),
    h('p', { class: 'c-text' }, `Behind the map stands a list of ${PLACE_COUNT.toLocaleString('en-US')} candidate settlements. It is not a complete count of the settlements of 1881, and you see only the places you have learned of.`),
    h('h3', { class: 'c-grp' }, 'Read and used'), h('ul', { class: 'c-notes' }, src),
    // Note: the recalled sources only show when there are any.
    recalled.length ? [h('h3', { class: 'c-grp' }, 'Recalled, not opened'), h('p', { class: 'c-text' }, 'What is said of these comes from memory and is unchecked.'), h('ul', { class: 'c-notes' }, recalled)] : null,
    h('h3', { class: 'c-grp' }, 'Checked, and how'), h('ul', { class: 'c-notes' }, checks),
    h('h3', { class: 'c-grp' }, 'Inferred'), h('ul', { class: 'c-notes' }, r.inferences.map((a) => h('li', {}, a))),
    h('h3', { class: 'c-grp' }, 'Invented'), h('p', { class: 'c-text' }, r.fiction),
    h('div', { class: 'actions' }, bigBtn('Close', () => close(true), { cls: 'primary', autofocus: true }))));
}

// Note: the title screen has no stage; a dialog from the title is shown on the empty stage, and the stage goes away with it.
async function onTitleStage(run) {
  const camp = $('camp');
  camp.classList.add('is-about');
  camp.classList.remove('is-hidden');
  try {
    return await run();
  } finally {
    camp.classList.remove('is-about');
    camp.classList.add('is-hidden');
  }
}

async function aboutFromTitle() {
  await onTitleStage(showAbout);
  const back = $('campAbout');
  if (back) back.focus();
}

// Note: a Quick Duel stands apart from the campaign: no save, no state, nothing carried back; each round has its own seed.
async function quickDuelFromTitle() {
  let again = true;
  // Note: the duel tune plays for the whole Quick Duel, as it does for a duel in the campaign, and the menu tune comes back with the title.
  S.app?.music?.setTrack('duel');
  S.app?.music?.start();
  while (again) {
    const spec = quickDuel(randomSeed());
    // Note: item 315: the quick duel is staged like every other duel.
    await onTitleStage(() => challengeCard(spec));
    again = await quickDuelCard(spec);
  }
  S.app?.music?.setTrack('menu');
  S.app?.music?.start();
  const back = $('quickDuel');
  if (back) back.focus();
}

// Note: one Quick Duel takes the window over like the breach; it ends on the result sheet, whose buttons answer true for another duel and false for the title, and Leave in the menu answers false.
function quickDuelCard(spec) {
  const sim = new DuelSim(spec);
  let open = true;
  windUntilDraw(sim, () => open);
  return new Promise((resolve) => {
    let ui = null;
    // Note: item 315: the quick duel closes on the outcome vignette too, then the choice is carried out.
    const leave = (again) => {
      const report = sim.report();
      open = false;
      ui.dispose();
      const died = report.playerStatus === 'dead' || report.wounds.some((w) => w.fatal);
      const opponentDied = report.opponentStatus === 'dead' || report.opponentWounds.some((w) => w.fatal);
      const result = { died, opponentDied, draw: report.fellTogether === true };
      onTitleStage(() => outcomeCard(spec, report, { ...result, account: settledLine({ player: spec.name, opponent: spec.opponent.name }, report, result) })).then(() => resolve(again));
    };
    ui = mountDuel(sim, {
      sound: cue, warp: duelWarp, quick: true,
      site: spec.site, names: { player: spec.name, opponent: spec.opponent.name }, witnesses: spec.witnesses,
      sides: { player: { role: 'sheriff', face: spec.portrait.face }, opponent: { reputation: spec.opponent.reputation, face: spec.opponent.portrait.face } },
      paused: () => document.hidden,
      leave: () => resolve(false),
      ending: () => ({
        buttons: [
          { label: 'Another duel', key: 'quick-again', cls: 'primary', autofocus: true, run: () => leave(true) },
          { label: 'Back to the title', key: 'quick-title', cls: 'ghost', run: () => leave(false) },
        ],
        hold: null,
        escape: () => leave(false),
      }),
    });
  });
}

// Note: items 304, 338, 391, 392: the win and the failure close on their storyboards; the win opens with brass and guitar, the failure with the toll and then silence.
function endingCard(v) {
  const won = v.ended.outcome === 'win';
  if (!won) S.app?.music?.stop();
  const st = v.story;
  if (won) {
    // Note: an avenger who died with the nemesis is shown from the books of the fallen.
    const avenger = v.crew.find((c) => c.role === 'sheriff') || v.fallen.slice().reverse().find((f) => f.role === 'sheriff');
    return stage(winScene({ nemesis: nemesisOf(st), sheriff: person(avenger), murdered: { portrait: st.murder.portrait, name: `Sheriff ${st.murder.sheriff}` }, murderDate: markOf(0) }));
  }
  return stage(failScene({ nemesis: nemesisOf(st) }));
}

// Note: the ending vignette waits for the result sheet and the death ceremony, so it is always the last card and never tolls over them.
function endingWhenFree(camp = S.camp) {
  if (S.camp !== camp) return;
  if (S.modal || S.grief.length || mourning) {
    setTimeout(() => endingWhenFree(camp), 150);
    return;
  }
  if (S.screen === 'end' && camp && camp.state.ended) endingCard(V());
}

function screenEnd(v) {
  const e = v.ended;
  const fallen = v.fallen.map((f) => h('li', { class: 'entry is-dead' }, h('span', { class: 'who' }, f.display || f.name), h('span', { class: 'chip dead' }, (f.title || f.role).toLowerCase()), h('span', { class: 'detail' }, `${f.cause}, ${stampOf(f.min)}`)));
  const won = e.outcome === 'win';
  // Note: item 499: a won Ironman campaign earns dynamite for every later scene, in this campaign's successors and in Quick Breach.
  const reward = won && v.ironman;
  if (reward && earnIronman(e, v.ironman)) {
    showHonours();
    say('Ironman reward: dynamite. Stores in every new campaign now sell it, and Quick Breach gives three bundles (G).');
  }
  if (!S.endShown) {
    S.endShown = true;
    endingWhenFree();
  }
  return {
    nav: [h('p', { class: 'c-nav-h' }, 'The end'), h('i', { class: 'c-fill' }), medal()],
    head: pageHead('The campaign is over', won ? 'Revenge' : 'The office is closed'),
    body: h('div', { class: 'c-end' },
      h('p', { class: 'c-lede2' }, sentence(e.reason)),
      facts([['Ended', `${dateOf(e.min).label}, ${dateOf(e.min).time}`], ['Cases settled', String(v.completed)], ['Standing', v.reputation.sheriff], ['Ironman', v.ironman ? 'Kept' : 'Forfeited'], ...(reward ? [['Ironman reward', 'Dynamite']] : []), ['Campaign No.', v.seed]]),
      reward ? h('p', { class: 'c-lede2' }, 'Ironman reward: dynamite. From now on stores sell bundles of five sticks, and Quick Breach gives the sheriff three. G lights a bundle and throws it.') : null,
      fallen.length ? h('section', { class: 'c-res' }, h('h3', { class: 'c-grp' }, 'The fallen'), h('ul', { class: 'ledger' }, fallen)) : null),
    foot: [
      footLeft(h('p', {}, '')),
      bigBtn('Back to the title', () => leaveToTitle(), { cls: 'ghost', key: 'end-title', sfx: 'tab' }),
      // Note: item 498: only a loss can be retried, and only while the last save before it is at hand.
      !won && S.checkpoint ? bigBtn('Retry', () => retryCampaign(), { cls: 'danger', key: 'end-retry', sfx: 'tab' }) : null,
      bigBtn('New campaign', () => startNew(), { cls: 'primary', key: 'end-new', sfx: 'tab' }),
    ],
  };
}

// Note: item 498: back to the last save before the loss; the first Retry asks, as it gives up the Ironman reward for this campaign.
async function retryCampaign() {
  const text = S.checkpoint;
  if (!text || !S.camp) return;
  if (S.camp.state.ironman !== false) {
    const yes = await confirm('Retry the campaign?', ['The campaign goes back to the last moment before the loss.', 'This campaign loses the Ironman reward for good.'], 'Retry', 'Keep the ending', true);
    if (!yes) return;
  }
  const camp = Campaign.load(text);
  camp.retried();
  startWith(camp);
  persist();
  say('The campaign goes back to before the loss. The Ironman reward is lost.');
}

// Note: a fight the sheriff met on the saloon floor keeps the piano; a teammate's fight is told on the campaign screens.
export const campaignMusicTrack = (screen, brawlSource = null) => screen === 'saloon' || (screen === 'brawl' && brawlSource === 'saloon') ? 'saloon' : screen === 'duel' || screen === 'spectacle' ? 'duel' : 'menu';

const SCREENS = { town: screenTown, saloon: screenSaloon, duel: screenDuel, spectacle: screenSpectacle, brawl: screenBrawl, travel: screenTravel, journey: screenJourney, end: screenEnd };

function go(screen) {
  S.screen = screen;
  S.focus = 'head';
  S.prep = screen === 'travel' ? S.prep : null;
  fx.clearToasts();
  draw();
}

function campVisible() {
  return !$('camp').classList.contains('is-hidden');
}

function showCamp() {
  $('overlay').classList.add('is-hidden');
  $('stage').classList.add('is-hidden');
  $('pause').classList.add('is-hidden');
  document.body.classList.remove('at-title');
  $('camp').classList.remove('is-hidden');
}

const put = (node, kids) => node.replaceChildren(...[kids].flat(Infinity).filter(Boolean));
const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&');

// Note: the one place the regions are filled; each screen returns the parts of its region, nothing is ever added to the stage itself.
function draw() {
  if (!S.camp) return;
  const v = V();
  // Note: item 476: the contacts of the town the party is in, for the case cards.
  S.contacts = S.camp.contacts();
  // Note: item 349: the sheriff's drink blurs, doubles and sways the scenes the player sees through his eyes.
  document.body.dataset.drink = (v.crew.find((c) => c.role === 'sheriff') || {}).drink || '';
  if (v.ended) {
    S.screen = 'end';
    store.clear();
    S.auto = false;
  } else if (v.journey) S.screen = 'journey';
  else if (S.screen === 'journey' || S.screen === 'end') S.screen = 'town';
  const stage = $('campStage');
  const body = $('campBody');
  const nav = $('campNav');
  const active = document.activeElement;
  const key = S.refocus || (active && stage.contains(active) && active.dataset ? active.dataset.key : null);
  S.refocus = null;
  const turnKey = `${S.screen}:${S.screen === 'town' ? S.tab : ''}`;
  const sameSheet = S.sheet === turnKey;
  const side = body.querySelector('.c-side');
  const scroll = { body: body.scrollTop, nav: nav.scrollTop, side: side ? side.scrollTop : 0 };
  fx.hideTip();
  S.typeQueue = [];
  const parts = SCREENS[S.screen](v);
  const track = campaignMusicTrack(S.screen, S.screen === 'brawl' ? S.camp.brawl()?.source : null);
  S.app?.music?.setTrack(track);
  if (track === 'duel' && !S.sceneOn) S.app?.music?.start();
  renderBar(v);
  put(nav, parts.nav);
  put($('campHead'), parts.head);
  put(body, parts.body);
  put($('campFoot'), parts.foot);
  body.classList.toggle('is-split', !!parts.split);
  body.dataset.screen = S.screen;
  if (sameSheet) {
    body.scrollTop = scroll.body;
    nav.scrollTop = scroll.nav;
    const again = body.querySelector('.c-side');
    if (again) again.scrollTop = scroll.side;
  } else {
    body.scrollTop = 0;
    nav.scrollTop = 0;
  }
  S.sheet = turnKey;
  const log = $('campLog');
  if (log) log.scrollTop = log.scrollHeight;
  if (!S.modal) {
    let target = null;
    if (S.focus !== 'head' && key) target = stage.querySelector(`[data-key="${cssEscape(key)}"]`);
    if (!target) target = $('campH') || $('campPanelH');
    if (target) target.focus({ preventScroll: true });
  }
  S.focus = 'keep';
  if (!sameSheet) fx.turn(body);
  flushType();
  notify();
  if (!S.holdGrief) flushGrief();
}

function syncSound() {
  const on = !sfx.isMuted();
  const b = $('campSound');
  b.classList.toggle('is-off', !on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.querySelector('span').textContent = on ? 'On' : 'Off';
  if (S.app?.music) S.app.music.setMuted(!on);
  for (const button of document.querySelectorAll('[data-menu-sound]')) {
    button.textContent = on ? 'Sound: on' : 'Sound: off';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function toggleSound() {
  sfx.toggle();
  syncMute('camp');
  if (!sfx.isMuted()) cue('click');
}

function startWith(camp) {
  stopAuto();
  // Note: item 499: once the player has earned the Ironman reward, the stores of every campaign sell dynamite.
  camp.state.unlocks ||= {};
  if (dynamiteSticks() > 0) camp.state.unlocks.dynamite = true;
  S.staged = null;
  S.camp = camp;
  S.auto = false;
  S.flash = [];
  S.history = [];
  S.names = {};
  S.qty = {};
  S.offers = {};
  S.shopWho = null;
  S.prep = null;
  S.dest = null;
  S.tab = 'board';
  S.busy = false;
  S.screen = camp.brawl() ? 'brawl' : camp.duel() ? 'duel' : camp.spectacle() ? 'spectacle' : camp.state.saloonVisit?.town === camp.state.at ? 'saloon' : 'town';
  S.saloonPatron = camp.state.saloonVisit?.patron || null;
  if (S.saloon) S.saloon.view.destroy();
  S.saloon = null;
  dropDuelUi();
  S.duelSim = null;
  S.spectSim = null;
  endBrawl();
  // Note: the music the failure card stopped comes back with the next campaign.
  if (camp.brawl()?.phase === 'fight') S.app?.music?.stop();
  else S.app?.music?.start();
  S.focus = 'head';
  S.sheet = null;
  S.seen = new Set();
  S.typeQueue = [];
  S.grief = [];
  S.holdGrief = false;
  S.endShown = false;
  S.departures = 0;
  S.checkpoint = camp.state.ended || camp.state.active ? null : camp.save();
  fx.anchor = null;
  fx.clearToasts();
  const v = V();
  S.cents = v.money.cents;
  S.warnText = v.supplies.warnings.join(' ');
  S.trail = v.journey && v.map.party ? [v.map.party] : [];
  // Note: what was already read in an earlier session is not typed out again.
  for (const c of v.accepted) S.seen.add(c.id);
  try {
    const t = camp.town();
    for (const c of (t.notices || []).concat(t.offers || [])) S.seen.add(c.id);
  } catch {
    // Note: on the road there is no town page to mark as read.
  }
  showCamp();
  draw();
}

async function startNew() {
  if (store.read()) {
    // Note: the question needs the stage, which is hidden on the title screen.
    const yes = await onTitleStage(() => confirm('Start a new campaign?', ['The saved campaign is replaced by the new one.'], 'Start anew', 'Keep the old one', true));
    if (!yes) return;
  }
  const camp = Campaign.create(randomSeed());
  store.write(camp.save());
  startWith(camp);
  await showOpening(S.camp.view());
  draw();
}

function loadSaved() {
  const text = store.read();
  if (!text) return false;
  let camp;
  try {
    camp = Campaign.load(text);
  } catch (err) {
    $('campTitleNote').textContent = `The saved campaign could not be read (${err.message}).`;
    return false;
  }
  // Note: a save written mid-scene is settled as a pull-out, never as a free retry of the same seed.
  let left = null;
  try {
    left = settleUnfinished(camp);
  } catch {
    camp.cancelEncounter();
  }
  startWith(camp);
  persist();
  if (left) {
    say('You left the scene unfinished. The Ironman status is forfeited.');
    notify();
  }
  return true;
}

function leaveToTitle() {
  stopAuto();
  S.auto = false;
  fx.clearToasts();
  $('camp').classList.add('is-hidden');
  S.app.toTitle();
  refreshTitle();
  const first = !$('continueCampaign').classList.contains('is-hidden') ? $('continueCampaign') : $('newCampaign');
  setTimeout(() => first.focus(), 0);
}

function refreshTitle() {
  let text = store.read();
  // Note: a save left from an ended campaign, as older versions wrote, or from an older save version, is dropped rather than offered to Continue.
  try {
    if (text && (JSON.parse(text).ended || JSON.parse(text).v !== STATE_VERSION)) {
      store.clear();
      text = null;
    }
  } catch {
    // Note: a damaged save is still shown, with its note below.
  }
  const cont = $('continueCampaign');
  cont.classList.toggle('is-hidden', !text);
  // Note: one gold plaque on the poster: Continue when a save is there.
  $('newCampaign').classList.toggle('primary', !text);
  $('newCampaign').classList.toggle('ghost', !!text);
  const note = $('campTitleNote');
  note.textContent = '';
  if (!text) return;
  try {
    const s = JSON.parse(text);
    const where = s.journey ? `on the road to ${placeName(s.journey.to)}` : placeName(s.at);
    note.textContent = `Saved campaign: ${dateOf(s.min).label}, ${where}.`;
  } catch {
    note.textContent = 'A saved campaign is here, but it may be damaged.';
  }
}

const PRESS = '.btn, .c-tab, .c-dest, .c-place.is-pick, .c-sound';
const live = (b) => b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled;

function wireInput(stage) {
  // Note: the press sounds on pointerdown, so a click feels instant; a key press sounds on click.
  stage.addEventListener('pointerdown', (e) => {
    fx.skip('type', 'count');
    const b = e.target.closest && e.target.closest(PRESS);
    if (!live(b) || b.id === 'campSound') return;
    b.dataset.pressed = '1';
    setTimeout(() => delete b.dataset.pressed, 700);
    const name = b.dataset.sfx || 'click';
    if (name !== 'none') cue(name);
  }, true);
  stage.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest(PRESS);
    if (!live(b) || b.id === 'campSound') return;
    if (b.dataset.pressed) {
      delete b.dataset.pressed;
      return;
    }
    const name = b.dataset.sfx || 'click';
    if (name !== 'none') cue(name);
  }, true);
  stage.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest && e.target.closest('.btn, .c-tab, .c-dest');
    if (live(b) && !b.contains(e.relatedTarget) && !b.classList.contains('is-on')) cue('tick');
  });
}

const typing = (t) => !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);

function onKey(e) {
  if (!campVisible() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (!S.camp) {
    // Note: on the bare title stage only Escape counts, and it closes the question.
    if (k === 'Escape' && S.modal && S.modalClose) {
      e.preventDefault();
      S.modalClose(null);
    }
    return;
  }
  if (k === 'Escape') {
    e.preventDefault();
    if (fx.busy()) fx.skip();
    else if (S.modal) {
      if (S.modalClose) S.modalClose(null);
    } else if (S.screen === 'travel') go('town');
    else if (S.screen !== 'end') showMenu();
    return;
  }
  if (typing(e.target)) return;
  if ((k === ' ' || k === 'Enter') && fx.busy() && (k === ' ' || e.target.tagName !== 'BUTTON')) {
    e.preventDefault();
    fx.skip();
    return;
  }
  if (k === 'm' || k === 'M') {
    e.preventDefault();
    toggleSound();
    return;
  }
  if (S.modal || S.busy) return;
  if (/^[1-9]$/.test(k) && S.screen === 'town' && S.tabs[Number(k) - 1]) {
    e.preventDefault();
    fx.anchor = fx.anchorOf(document.querySelector(`[data-key="tab-${S.tabs[Number(k) - 1]}"]`));
    cue('tab');
    openTab(S.tabs[Number(k) - 1]);
  }
}

export function initCamp(app) {
  S.app = app;
  app.menuSound = sfx;
  const stage = $('campStage');
  fitStage(stage);
  fx = createFx(stage, { sfx: cue });
  wireInput(stage);
  // Note: item 328: the title's, the briefing's and the report's controls sound as the campaign's do.
  for (const id of ['title', 'briefing', 'result']) if ($(id)) wireInput($(id));
  window.addEventListener('keydown', onKey);
  // Note: nothing audio-related is built before the first gesture, and never while a tactical scene runs.
  const unlock = () => {
    if (!S.sceneOn) sfx.unlock();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  sfx.subscribe(syncSound);
  syncSound();
  $('campSound').addEventListener('click', toggleSound);
  for (const button of document.querySelectorAll('[data-menu-sound]')) button.addEventListener('click', toggleSound);
  if (sfx.isMuted()) syncMute('camp');
  $('newCampaign').addEventListener('click', startNew);
  $('continueCampaign').addEventListener('click', loadSaved);
  $('campAbout').addEventListener('click', aboutFromTitle);
  $('quickDuel').addEventListener('click', quickDuelFromTitle);
  $('newCampaign').disabled = false;
  $('quickDuel').disabled = false;
  const onTitle = document.body.classList.contains('at-title') && [document.body, $('toBriefing')].includes(document.activeElement);
  // Note: item 330: the effects fall silent with the page hidden, as the music does; a running scene keeps them held.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAuto();
      sfx.suspend();
    } else {
      if (!S.sceneOn) sfx.resume();
      autoLoop();
    }
  });
  refreshTitle();
  if (onTitle) (!$('continueCampaign').classList.contains('is-hidden') ? $('continueCampaign') : $('newCampaign')).focus();
  const api = {
    key: SAVE_KEY,
    get campaign() { return S.camp; },
    get screen() { return S.screen; },
    get state() { return S; },
    get fx() { return fx; },
    sfx,
    saved: () => store.read(),
    // Note: start is a test fixture (state.js P2_START); the title's button always starts the revenge.
    newCampaign: (seed, start = null) => {
      const camp = Campaign.create(seed || randomSeed(), start);
      store.write(camp.save());
      startWith(camp);
      return camp;
    },
    continueCampaign: loadSaved,
    draw,
    step,
    go,
  };
  window.__ws.camp = api;
  return api;
}
