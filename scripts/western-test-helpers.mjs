// Note: stand-ins and oracles that several western test files share; no test of its own lives here.

import { snapshot } from '../public/western/js/tactical-memory.js';
import { makeMind, observeThreat } from '../public/western/js/mind.js';
import { TEAM_LIMITS } from '../public/western/js/camp/crew.js';
import { rng, seedFromString } from '../public/western/js/rand.js';
import { personKey, ensurePerson } from '../public/western/js/people.js';
import { T } from '../public/western/js/tiles.js';
import { makeMap, newFloor, setTile } from '../public/western/js/map.js';
import { STEP } from '../public/western/js/config.js';

// Note: a random stream seeded from a key, so a scene replays the same.
export function seededRand(key) {
  const r = rng(seedFromString(key));
  return () => r.next();
}

// Note: an actor that neither thinks nor moves any more.
export const park = (a) => {
  a.thinkT = 1e9;
  a.intent = { move: null };
};

// Note: puts an actor on floor 0 facing the given way, with that spot as his home.
export function put(sim, a, x, y, facing = 0) {
  Object.assign(a, { x, y, floor: 0, facing, home: { x, y, floor: 0 }, nav: null });
  sim.updateEye(a);
  return a;
}

// Note: ticks in a second of play.
export const SECOND = Math.round(1 / STEP);
// Note: an order call repeated each second from tick `from` until the deputy takes it, since he may turn one down.
export const callUntilTaken = (d, n, i, from = SECOND) => (i >= from && (i - from) % SECOND === 0 && !d.ai.order?.accepted ? n : 0);

// Note: the key of a square zone of open ground, and the square a zone of open ground covers.
export const squareKey = ({ f, x, y }) => `${f}:${x}:${y}`;
export const squareOf = (z) => ({ x: Math.floor(z.x0 / 5), y: Math.floor(z.y0 / 5) });

// Note: two open floors with an adobe border round the ground floor.
export function walledFloors() {
  const map = makeMap([newFloor(T.FLOOR), newFloor(T.FLOOR)]);
  for (let i = 0; i < 40; i++) for (const [x, y] of [[i, 0], [i, 29], [0, i % 30], [39, i % 30]]) setTile(map, 0, x, y, T.ADOBE);
  return map;
}

// Note: independent ray casting against a geojson ring; an odd number of crossings is inside.
export function inRing(lon, lat, ring) {
  let crossings = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    crossings += Number((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
  }
  return crossings % 2 === 1;
}

// Note: 32-bit FNV-1a of a string as a number; fnvHex is the same digest as eight hex digits.
export const fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
export const fnvHex = (s) => fnv(s).toString(16).padStart(8, '0');

// Note: a canvas stand-in that keeps every filled pixel, so people and poses can be compared in Node without a browser.
const pixelKeys = Array.from({ length: 128 }, (_, y) => Array.from({ length: 128 }, (_, x) => `${x},${y}`));
export function fakeCanvas(w, h) {
  const grid = new Map();
  let fill = '';
  const ctx = {
    set fillStyle(v) { fill = v; },
    get fillStyle() { return fill; },
    fillRect(x, y, rw, rh) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) grid.set(pixelKeys[yy]?.[xx] ?? `${xx},${yy}`, fill);
    },
    clearRect() {},
  };
  return { width: w, height: h, grid, getContext: () => ctx };
}

// Note: ticks 0 to total-1 go through step, sample runs after every n-th one starting with the first, and the run ends early once stop() holds.
export function sampled(total, n, stop, step, sample) {
  for (let i = 0; i < total && !stop(); i += n) {
    step(i);
    sample();
    for (let j = i + 1; j < Math.min(i + n, total) && !stop(); j++) step(j);
  }
}

// Note: a Sim-shaped report of a won scene for the lawmen of a spec; `over` maps a charId to overrides of that lawman, `o` overrides the report.
export function lawmenReport(spec, o = {}, over = {}) {
  const lawmen = [spec.party.sheriff, ...spec.party.deputies].map((m) => {
    const rounds = { '44-40': m.reserve['44-40'], '45colt': m.reserve['45colt'] };
    m.loadout.forEach((w) => { rounds[w.ammoType] += w.loaded; });
    return {
      charId: m.charId, role: 'x', name: m.name, status: 'ok', cause: null, wounds: [], withdrawn: false, diedAfterVictory: false, dying: false, carriedOut: false,
      loadout: m.loadout.map((w) => ({ ...w })), reserve: { ...m.reserve }, rounds, floor: [], ...(over[m.charId] || {}),
    };
  });
  return {
    result: 'success', reason: 'all hostiles down', time: 100, hostilesTotal: 3, hostilesDown: 3, civilianDied: false, siteKind: spec.siteKind, terrain: spec.terrain, lawmen, ...o,
  };
}

// Note: the ids the campaign screens ask for, in the order they ask; index.html has most of them and the screens make the rest.
export const CAMP_PAGE_IDS = ['campStage', 'campSound', 'newCampaign', 'continueCampaign', 'quickDuel', 'campAbout', 'campTitleNote', 'overlay', 'stage', 'pause', 'camp', 'campBody', 'campNav', 'campBar', 'campHead', 'campFoot', 'campLog', 'campH', 'campPurse', 'campLive', 'campLoading', 'duel-view-style', 'campDialog', 'campDialogBody', 'campMain'];

// Note: installs a stand-in DOM, window, animation frames and storage as globals for the campaign screens (js/camp/cui.js); returns the queued animation frames.
export function installStandInDom(pageIds = CAMP_PAGE_IDS) {
  let active = null;
  const noop = () => {};

  // Note: a node and its ancestors, nearest first.
  const chain = (n) => {
    const out = [];
    for (let x = n; x; x = x.parentNode) out.push(x);
    return out;
  };

  function parse(sel) {
    return sel.split(',').map((part) => {
      const tokens = [...part.trim().matchAll(/([.#]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)];
      const names = tokens.filter((m) => !m[2]).map((m) => m[1]);
      return {
        tag: names.filter((n) => /^[\w-]/.test(n)).map((n) => n.toUpperCase()).at(-1) ?? null,
        cls: names.filter((n) => n[0] === '.').map((n) => n.slice(1)),
        id: names.filter((n) => n[0] === '#').map((n) => n.slice(1)).at(-1) ?? null,
        attrs: tokens.filter((m) => m[2]).map((m) => [m[2], m[3]]),
      };
    });
  }

  const imageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
  const gradient = () => ({ addColorStop() {} });
  const CTX_METHODS = new Map([
    ['getImageData', imageData], ['createImageData', imageData], ['measureText', () => ({ width: 10 })],
    ['createLinearGradient', gradient], ['createRadialGradient', gradient], ['createPattern', gradient],
  ]);
  const ctx2d = new Proxy({}, {
    get: (t, k) => t[k] ?? CTX_METHODS.get(k) ?? noop,
    set: (t, k, v) => { t[k] = v; return true; },
  });

  // Note: a node that was never attached keeps its place in a list of its own, so removing it needs no check.
  const DETACHED = { children: [] };

  class Node {
    constructor() {
      this.parentNode = null;
    }

    remove() {
      const siblings = (this.parentNode ?? DETACHED).children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
  }

  class Text extends Node {
    constructor(s) {
      super();
      this.textContent = String(s);
      this.data = this.textContent;
      this.children = [];
    }

    matches() { return false; }
    matchesParsed() { return false; }
  }

  // Note: strings become text nodes, so every child is a node.
  const NODE_OF = { string: (s) => new Text(s), object: (n) => n };
  const dataKey = (k) => `data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

  class El extends Node {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attrs = new Map();
      this.listeners = new Map();
      this.classes = new Map();
      this.style = { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; }, removeProperty() {} };
      this.scrollTop = 0;
      this.scrollHeight = 0;
      this.offsetWidth = 100;
      this.offsetHeight = 40;
      this.clientWidth = 100;
      this.clientHeight = 100;
      this._text = '';
      const own = this;
      // Note: the game always passes force to toggle.
      this.classList = {
        add: (...c) => c.forEach((x) => own.classes.set(x, true)),
        remove: (...c) => c.forEach((x) => own.classes.set(x, false)),
        contains: (c) => own.classes.get(c) === true,
        toggle: (c, force) => {
          own.classes.set(c, !!force);
          return !!force;
        },
      };
      // Note: dataset is a view of the data- attributes, as in a browser.
      this.dataset = new Proxy({}, {
        get: (_, k) => own.attrs.get(dataKey(k)),
        set: (_, k, v) => {
          own.attrs.set(dataKey(k), String(v));
          return true;
        },
        has: (_, k) => own.attrs.has(dataKey(k)),
        deleteProperty: (_, k) => own.attrs.delete(dataKey(k)),
      });
    }

    get childNodes() { return this.children; }
    get className() { return [...this.classes].filter(([, on]) => on).map(([c]) => c).join(' '); }
    set className(v) { this.classes = new Map((String(v).match(/\S+/g) ?? []).map((c) => [c, true])); }
    get id() { return this.attrs.get('id') ?? ''; }
    set id(v) { this.attrs.set('id', String(v)); }
    get isConnected() { return chain(this).at(-1) === document.documentElement; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) {
      this.replaceChildren();
      this._text = String(v);
    }

    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    append(...kids) {
      kids.map((k) => NODE_OF[typeof k](k)).forEach((node) => {
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      });
    }

    appendChild(k) { this.append(k); return k; }
    prepend(...kids) { this.append(...kids); }
    replaceChildren(...kids) {
      this.children.forEach((c) => { c.parentNode = null; });
      this.children = [];
      this._text = '';
      this.append(...kids);
    }

    contains(n) { return chain(n).includes(this); }
    addEventListener(t, f) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), f]); }
    removeEventListener(t, f) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((x) => x !== f)); }
    // Note: an event runs the listeners of the node and then of each ancestor, until one stops it.
    dispatchEvent(e) {
      chain(this).every((node) => {
        [...(node.listeners.get(e.type) ?? [])].forEach((f) => f(e));
        return !e.cancelBubble;
      });
      return true;
    }

    click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() { this.cancelBubble = true; } }); }
    focus() { active = this; }
    matches(sel) { return this.matchesParsed(parse(sel)); }
    // Note: a query parses its selector once and then asks each node.
    matchesParsed(parts) {
      return parts.some((t) => (!t.tag || t.tag === this.tagName) && t.cls.every((c) => this.classes.get(c) === true) && (!t.id || this.id === t.id)
        && t.attrs.every(([k, v]) => this.attrs.has(k) && (v === undefined || this.attrs.get(k) === v)));
    }

    closest(sel) {
      const parts = parse(sel);
      return chain(this).find((n) => n.matchesParsed(parts)) ?? null;
    }

    get descendants() {
      const out = [];
      this.children.forEach(function add(c) {
        out.push(c);
        c.children.forEach(add);
      });
      return out;
    }

    querySelectorAll(sel) {
      const parts = parse(sel);
      return this.descendants.filter((n) => n.matchesParsed(parts));
    }

    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0 }; }
    getContext() { return ctx2d; }
  }

  const body = new El('body');
  const html = new El('html');
  html.append(new El('head'), body);
  const ids = new Map(pageIds.map((id) => [id, new El('div')]));
  ids.forEach((e, id) => {
    e.setAttribute('id', id);
    body.append(e);
  });
  // Note: the two parts of index.html the screens look inside.
  ids.get('campSound').append(new El('span'));
  ids.get('campDialog').append(Object.assign(new El('div'), { className: 'c-modal-card' }));
  globalThis.document = {
    body,
    head: html.children[0],
    documentElement: html,
    hidden: false,
    get activeElement() { return active; },
    createElement: (t) => new El(t),
    createElementNS: (ns, t) => new El(t),
    createTextNode: (s) => new Text(s),
    getElementById: (id) => ids.get(id) ?? null,
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = Object.assign(new EventTarget(), { __ws: {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
  const frames = [];
  globalThis.requestAnimationFrame = (f) => frames.push(f);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = (() => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  })();
  return frames;
}

// Note: item 322: the lowest team reputation at which the office holds the crew it has, for tests that build a large crew by hand.
export const standingFor = (state) => TEAM_LIMITS.find(([, office]) => office >= state.crew.filter((c) => c.role !== 'sheriff').length)[0];
// Note: raises the team reputation, never lowers it, so the crew built by hand stays in the office.
export const holdCrew = (state) => {
  state.rep.team = Math.max(state.rep.team, standingFor(state));
};

// Note: a scenario briefing gives explicit prior observations, and hidden actors are not otherwise known.
export function briefTacticalParty(sim) {
  for (const deputy of sim.deputies) {
    deputy.ai.people = new Map(sim.lawmen.filter((a) => a !== deputy).map((a) => [a.id, snapshot(a, sim.time)]));
    deputy.ai.mind = makeMind();
    for (const hostile of sim.hostiles.filter((h) => h.status === 'ok')) observeThreat(deputy.ai.mind,
      { id: hostile.id, x: hostile.x, y: hostile.y, f: hostile.floor, t: sim.time, src: 'report', conf: 0.8 });
  }
}

// Note: paints one person description on a stand-in canvas and returns its texture key and a digest of its pixels; the global document is restored afterwards.
export function paintPerson(desc) {
  const saved = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas(80, 80) };
  const store = new Map();
  const key = personKey(desc);
  ensurePerson({ textures: { exists: (k) => store.has(k), addCanvas: (k, c) => store.set(k, c) } }, desc);
  globalThis.document = saved;
  return { key, px: fnvHex([...store.get(key).grid.entries()].sort().join('|')) };
}
