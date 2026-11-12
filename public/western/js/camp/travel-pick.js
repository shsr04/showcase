// Note: choosing a destination among thousands of known places: a name index, quick lists, paging, and the facts of one place for the preview.
// Note: item 172: every list here is built from the known-place index, so an unknown place can neither be found nor named.

import {
  PLACES, ROUTES, TERRAINS, routeTree, legsOf, estimateLegHours, weatherAt, regionOf,
} from './world.js';
import {
  el, nearestKnown, uncertaintyNote, jurisdictionName, jurisdictionAbbr, kindWord, sizeWord, placeLine,
} from './map-view.js';
import { daysOf } from './travel.js';

export const PER_PAGE = 6;
export const MAX_QUICK = 120;
export const MAX_FOUND = 200;
export const WITHIN = [[0, 'Anywhere'], [50, '\u2264 50 km'], [150, '\u2264 150 km'], [400, '\u2264 400 km'], [1000, '\u2264 1,000 km']];
export const SIZES = [[0, 'Any size'], [1, '100+ pop.'], [2, '500+ pop.'], [3, '2,500+ pop.'], [4, '10,000+ pop.']];

// Note: lower case, no accents, no dots or apostrophes, hyphens as spaces: "St. Louis" and "st louis" are one name.
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Note: every known name once from its start and once from each later word, sorted; a search is a binary search plus a walk over the matches, never a pass over all places.
export function nameKeys(index) {
  if (index.names) return index.names;
  const keys = [];
  for (const it of index.items) {
    const n = normalize(it.name);
    keys.push([n, it, 0]);
    for (let i = 1; i < n.length; i++) if (n[i - 1] === ' ') keys.push([n.slice(i), it, 1]);
  }
  keys.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  index.names = keys;
  return keys;
}

// Note: known places whose name, or a later word of it, starts with the query; exact names first, then names, then later words, then the bigger and the nearer place.
export function searchKnown(index, query, o = {}) {
  const q = normalize(query);
  if (!q) return [];
  const keys = nameKeys(index);
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid][0] < q) lo = mid + 1;
    else hi = mid;
  }
  const seen = new Map();
  for (let i = lo; i < keys.length && seen.size < 1500; i++) {
    const [key, it, word] = keys[i];
    if (!key.startsWith(q)) break;
    if (it.id === o.skip) continue;
    const rank = word ? 2 : key === q ? 0 : 1;
    const had = seen.get(it.id);
    if (!had || rank < had.rank) seen.set(it.id, { it, rank });
  }
  const from = o.from;
  const found = [...seen.values()].map((f) => ({ ...f, d: from ? Math.hypot(f.it.x - from.x, f.it.y - from.y) : 0 }));
  found.sort((a, b) => a.rank - b.rank || b.it.size - a.it.size || a.d - b.d || (a.it.name < b.it.name ? -1 : 1));
  return found.slice(0, o.limit ?? MAX_FOUND);
}

// Note: the quick lists; mode 'near' is distance from the party, mode 'large' is size class and then distance, both filtered by distance and size and cut to MAX_QUICK.
// Note: o.road(id) gives the road km the list shows; the distance filter and the order use it, and the straight line only where there is no road; a road is never shorter than the straight line, so the straight-line search finds every candidate.
export function quickList(index, mode, from, o = {}) {
  const maxKm = o.withinKm > 0 ? o.withinKm : Infinity;
  const minSize = o.minSize || 0;
  const dist = (it, d) => {
    const r = o.road ? o.road(it.id) : undefined;
    return r === undefined ? d : r;
  };
  if (mode === 'near') {
    const found = nearestKnown(index, from.x, from.y, { limit: o.road ? MAX_QUICK * 3 : MAX_QUICK, maxKm, minSize, skip: o.skip }).map((f) => ({ it: f.it, d: dist(f.it, f.d), rank: 0 })).filter((f) => f.d <= maxKm);
    if (o.road) found.sort((a, b) => a.d - b.d || (a.it.name < b.it.name ? -1 : 1));
    return found.slice(0, MAX_QUICK);
  }
  const out = [];
  for (const it of index.items) {
    if (it.id === o.skip || it.size < minSize) continue;
    const d = dist(it, Math.hypot(it.x - from.x, it.y - from.y));
    if (d <= maxKm) out.push({ it, d, rank: 0 });
  }
  out.sort((a, b) => b.it.size - a.it.size || a.d - b.d || (a.it.name < b.it.name ? -1 : 1));
  return out.slice(0, MAX_QUICK);
}

export function pageOf(list, page, per = PER_PAGE) {
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const items = list.slice(p * per, p * per + per);
  return { items, page: p, pages, total: list.length, from: items.length ? p * per + 1 : 0, to: p * per + items.length };
}

export const hoursText = (n) => (n < 1 ? `${Math.max(1, Math.round(n * 60))} min` : n < 20 ? `${Math.round(n * 10) / 10} h` : `${Math.round(n)} h`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const num = (n) => Number(n).toLocaleString('en-US');

// Note: the services a place of this kind would have in the game, in words; the data infers them from size and region, so the line says "usually".
export function servicesLine(id) {
  const p = PLACES[id];
  if (!p) return '';
  const s = p.services || {};
  const names = [];
  if (s.store) names.push('a store');
  if (s.livery) names.push('a livery');
  if (s.doctor) names.push('a doctor');
  if (s.saloon) names.push('a saloon');
  if (s.notices) names.push('a notice board');
  if (s.recruit) names.push('hands for hire');
  return names.length ? `Likely has ${list(names)}.` : 'Little beyond talk with the locals.';
}

// Note: the ground of a path by length, the two biggest shares at 20 percent or more.
export function groundOf(legs) {
  const km = {};
  let total = 0;
  for (const L of legs) {
    const r = ROUTES[L.route];
    for (const s of r.segments) {
      km[s.terrain] = (km[s.terrain] || 0) + r.km * s.share;
      total += r.km * s.share;
    }
  }
  return Object.entries(km).sort((a, b) => b[1] - a[1]).filter(([, v]) => v / (total || 1) >= 0.2).slice(0, 3).map(([t]) => (TERRAINS[t] ? TERRAINS[t].label : t));
}

// Note: everything the preview shows besides what prepareDestination gives; read-only, it draws no random numbers and changes no state.
export function previewFacts(state, here, id) {
  const place = PLACES[id];
  const from = PLACES[here];
  if (!place || !from) return null;
  const wagonTree = routeTree(here, true);
  const walkTree = routeTree(here, false);
  const walk = walkTree ? walkTree.path(id) : null;
  const wagon = wagonTree ? wagonTree.path(id) : null;
  const modes = [];
  if (walk) {
    const legs = legsOf(walk);
    modes.push({ mode: 'foot', label: 'On foot', hours: estimateLegHours(legs, 'foot') }, { mode: 'horse', label: 'Horseback', hours: estimateLegHours(legs, 'horse') });
  }
  if (wagon) modes.push({ mode: 'wagon', label: 'Wagon', hours: estimateLegHours(legsOf(wagon), 'wagon') });
  for (const m of modes) m.days = daysOf(m.hours);
  const w = weatherAt(state.seed, state.min, place.region);
  const region = regionOf(id);
  return {
    modes,
    wagonRoad: !!wagon,
    roadKm: walkTree ? walkTree.km(id) : undefined,
    directKm: Math.round(Math.hypot(place.x - from.x, place.y - from.y)),
    ground: walk ? groundOf(legsOf(walk)) : [],
    region: region ? { name: region.name, climate: region.climate } : null,
    weather: { label: w.label, highF: w.highF, lowF: w.lowF, snowy: !!w.snowy, rainy: !!w.rainy },
    services: servicesLine(id),
  };
}

const STATES = new WeakMap();

// Note: the search text, the mode, the filters and the page live per campaign and per place the party stands in, so a redraw of the screen keeps them.
export function pickerState(camp, here) {
  let s = STATES.get(camp);
  if (!s || s.here !== here) {
    s = { here, q: '', mode: 'near', within: 0, minSize: 0, page: 0, cache: null };
    STATES.set(camp, s);
  }
  return s;
}

function resultsOf(st, index, from, here, tree, wagon) {
  const q = st.q.trim();
  if (q) return { kind: 'search', rows: searchKnown(index, q, { from, skip: here }) };
  const key = `${st.mode}|${st.within}|${st.minSize}|${tree ? (wagon ? 'w' : 'f') : ''}`;
  if (st.cache && st.cache.index === index && st.cache.key === key) return st.cache.value;
  const value = { kind: st.mode, rows: quickList(index, st.mode, from, { withinKm: st.within, minSize: st.minSize, skip: here, road: tree ? (id) => tree.km(id) : null }) };
  st.cache = { index, key, value };
  return value;
}

// Note: o holds camp, index, here (id), wagon (bool), selected (id) and onPick(id), and the nodes of the left board come back with only the list rebuilt while typing.
export function pickerNav(o) {
  const st = pickerState(o.camp, o.here);
  const from = PLACES[o.here];
  const tree = routeTree(o.here, !!o.wagon);
  const input = el('input', {
    type: 'search', class: 'mv-search', placeholder: 'Find a known place', 'aria-label': 'Search the places you know by name', autocomplete: 'off', spellcheck: 'false', 'data-key': 'dest-search', maxlength: '40',
  });
  input.value = st.q;
  const tab = (mode, label) => {
    const b = el('button', { type: 'button', class: 'btn small mv-tabbtn', 'data-key': `dest-mode-${mode}`, 'data-sfx': 'tab', 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => {
      st.mode = mode;
      st.q = '';
      st.page = 0;
      input.value = '';
      render();
    });
    return b;
  };
  const near = tab('near', 'Nearest');
  const large = tab('large', 'Largest');
  const select = (opts, current, key, label, set) => {
    const s = el('select', { class: 'mv-select', 'data-key': key, 'aria-label': label });
    for (const [v, text] of opts) s.append(el('option', { value: String(v), ...(v === current ? { selected: '' } : {}) }, text));
    s.addEventListener('change', () => {
      set(Number(s.value));
      st.page = 0;
      render();
    });
    return s;
  };
  const within = select(WITHIN, st.within, 'dest-within', 'Show places within this distance', (v) => { st.within = v; });
  const sizes = select(SIZES, st.minSize, 'dest-size', 'Show places of at least this size', (v) => { st.minSize = v; });
  const count = el('p', { class: 'c-nav-note mv-count', role: 'status', 'aria-live': 'polite' });
  const ul = el('ul', { class: 'c-dests mv-results', 'aria-label': 'Known places' });
  const prev = el('button', { type: 'button', class: 'btn small', 'data-key': 'dest-prev', 'data-sfx': 'tab', 'aria-label': 'Previous page' }, '‹ Prev');
  const next = el('button', { type: 'button', class: 'btn small', 'data-key': 'dest-next', 'data-sfx': 'tab', 'aria-label': 'Next page' }, 'Next ›');
  const pageNo = el('span', { class: 'mv-pageno', 'aria-hidden': 'true' });
  const pager = el('div', { class: 'mv-pager' }, prev, pageNo, next);

  function render() {
    const found = resultsOf(st, o.index, from, o.here, tree, !!o.wagon);
    const pg = pageOf(found.rows, st.page);
    st.page = pg.page;
    near.setAttribute('aria-pressed', String(found.kind === 'near'));
    large.setAttribute('aria-pressed', String(found.kind === 'large'));
    near.classList.toggle('is-on', found.kind === 'near');
    large.classList.toggle('is-on', found.kind === 'large');
    const searching = found.kind === 'search';
    within.disabled = searching;
    sizes.disabled = searching;
    ul.replaceChildren();
    for (const row of pg.items) {
      const it = row.it;
      const km = tree ? tree.km(it.id) : undefined;
      const road = km === undefined ? 'no road' : `${num(Math.round(km))} km`;
      const on = o.selected === it.id;
      const b = el('button', {
        type: 'button',
        class: `c-dest mv-item${on ? ' is-on' : ''}${it.uncertain ? ' is-vague' : ''}`,
        'data-key': `dest-${it.id}`,
        'data-sfx': 'tab',
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': `${it.name}, ${kindWord(it)}, ${jurisdictionName(it)}, ${km === undefined ? 'no road from here' : `${Math.round(km)} kilometres by road`}${it.uncertain ? ', record doubtful' : ''}`,
      }, el('b', {}, it.name), el('small', {}, `${jurisdictionAbbr(it)} · ${kindWord(it)} · ${road}`));
      b.addEventListener('click', () => o.onPick(it.id));
      ul.append(el('li', {}, b));
    }
    const total = num(o.index.items.length);
    if (!found.rows.length) {
      count.textContent = searching ? `No known place is called “${st.q.trim()}”.` : o.index.items.length > 1 ? `No known place fits. You know ${total}.` : 'You know no other place yet.';
    } else if (searching) {
      count.textContent = found.rows.length >= MAX_FOUND ? `${MAX_FOUND}+ names match; ${pg.from}–${pg.to} shown. Type more.` : `${found.rows.length} ${found.rows.length === 1 ? 'name matches' : 'names match'}; ${pg.from}–${pg.to} shown.`;
    } else {
      count.textContent = `${pg.from}–${pg.to} of ${found.rows.length}${found.rows.length >= MAX_QUICK ? '+' : ''} by ${st.mode === 'near' ? 'nearness' : 'size'}. You know ${total}.`;
    }
    prev.setAttribute('aria-disabled', pg.page > 0 ? 'false' : 'true');
    next.setAttribute('aria-disabled', pg.page < pg.pages - 1 ? 'false' : 'true');
    pageNo.textContent = `${pg.page + 1} / ${pg.pages}`;
    pager.hidden = pg.pages < 2;
  }

  prev.addEventListener('click', () => {
    if (prev.getAttribute('aria-disabled') === 'true') return;
    st.page -= 1;
    render();
  });
  next.addEventListener('click', () => {
    if (next.getAttribute('aria-disabled') === 'true') return;
    st.page += 1;
    render();
  });
  input.addEventListener('input', () => {
    st.q = input.value;
    st.page = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = ul.querySelector('button');
      e.preventDefault();
      if (first) first.click();
    } else if (e.key === 'ArrowDown') {
      const first = ul.querySelector('button');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      st.q = '';
      st.page = 0;
      render();
    }
  });
  ul.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...ul.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) input.focus();
    else items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  render();
  return [
    el('p', { class: 'c-nav-h' }, 'Known places'),
    input,
    el('div', { class: 'mv-modes', role: 'group', 'aria-label': 'Quick picks' }, near, large),
    el('div', { class: 'mv-filters' }, within, sizes),
    count,
    ul,
    pager,
  ];
}

const row = (label, value) => (value ? el('div', {}, el('dt', {}, label), el('dd', {}, value)) : null);

// Note: o: entry (the known-place item), dest (prepareDestination result), facts (previewFacts), mode (the party's transport kind).
export function previewPanel(o) {
  const { entry, dest, facts } = o;
  const note = uncertaintyNote(entry);
  const box = el('section', { class: 'mv-preview', 'aria-label': `About ${entry.name}` });
  box.append(
    el('h3', { class: 'mv-pv-name' }, entry.name),
    el('p', { class: 'mv-pv-sub' }, `${placeLine(entry).replace(' · doubtful record', '')} · ${jurisdictionName(entry)} · ${sizeWord(entry)}`),
  );
  if (note) {
    box.append(el('p', { class: 'mv-doubtbox' }, el('b', {}, 'Not certain. '), note.lead, ...(note.more.length ? [el('small', {}, note.more.join(' '))] : [])));
  }
  const dl = el('dl', { class: 'c-facts mv-facts' });
  const rows = [];
  if (!dest.reachable) {
    rows.push(row('The way', `${dest.reason ? `${dest.reason[0].toUpperCase()}${dest.reason.slice(1)}` : 'No road'} from here.${facts && facts.modes.some((m) => m.mode !== 'wagon') && o.mode === 'wagon' ? ' On horseback or on foot the party could still go.' : ''}`));
  } else {
    rows.push(row('By road', `${num(Math.round(dest.km))} km (direct ${num(facts.directKm)} km)`));
    for (const m of facts.modes) {
      const mine = m.mode === o.mode;
      rows.push(row(m.label, el('span', { class: mine ? 'mv-mine' : '' }, `${hoursText(m.hours)} · ${plural(m.days, 'day', 'days')}${mine ? ' (your way)' : ''}`)));
    }
    if (!facts.wagonRoad) rows.push(row('Wagon', 'No wagon road all the way; a wagon cannot go.'));
    rows.push(
      row('Ground', facts.ground.join(', ')),
      row('Danger', `${dest.danger}${dest.springs ? `, ${plural(dest.springs, 'spring', 'springs')} on the way` : ''}`),
      row('Via', dest.via && dest.via.length ? `${dest.via.slice(0, 3).join(', ')}${dest.via.length > 3 ? ` and ${dest.via.length - 3} more` : ''}` : ''),
    );
  }
  if (facts) {
    rows.push(
      row('Region', facts.region ? el('span', {}, facts.region.name, el('small', {}, facts.region.climate)) : ''),
      row('Weather', `${facts.weather.label}, high ${facts.weather.highF}°F${facts.weather.snowy ? ', snow' : ''}`),
      row('Services', facts.services),
    );
  }
  // Note: Node.append turns a null into the text "null", so the empty rows are dropped here.
  dl.append(...rows.filter(Boolean));
  box.append(dl);
  return box;
}
