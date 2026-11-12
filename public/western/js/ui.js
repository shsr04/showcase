// Note: DOM layer for the menus; poster, briefing helpers, pause focus and the outcome ledger. Nothing here draws during play.

import { randomSeed } from './rand.js';

const $ = (id) => document.getElementById(id);

const LABEL = { sheriff: 'The sheriff', deputy: 'The deputy', civilian: 'The civilian' };
const GENERIC = new Set(['Sheriff', 'Deputy', 'Civilian']);
// Note: wording that depends on the kind of site; an outdoor scene has no house to clear.
const PLACE = {
  house: { clear: 'The house is clear', lost: 'The breach has failed', after: 'after the house was clear', where: 'inside' },
  outdoor: { clear: 'The ground is clear', lost: 'The encounter has failed', after: 'after the fight was won', where: 'on the ground' },
};
const placeOf = (r) => PLACE[r.siteKind] || PLACE.house;

// Note: a party's deputies and a campaign's named lawmen keep their own names; the plain default names read as a role.
function nameOf(p) {
  if (GENERIC.has(p.name)) return LABEL[p.role] || p.name;
  return p.name || LABEL[p.role] || p.role;
}
const STATE = {
  ok: { chip: 'Wounded', cls: 'down' },
  incapacitated: { chip: 'Incapacitated', cls: 'down' },
  dead: { chip: 'Dead', cls: 'dead' },
};
// Note: a hostile still on its feet at the end is shown as still wanted.
const GANG = {
  ok: { chip: 'Wanted', cls: 'wanted' },
  incapacitated: { chip: 'Incapacitated', cls: 'down' },
  dead: { chip: 'Down', cls: 'dead' },
};

// Note: names the shooter's side; a lawman hitting a lawman or civilian is friendly fire, a hostile hitting a hostile is its own fire.
const WHO = { sheriff: 'the sheriff', deputy: 'the deputy', hostile: 'a hostile', civilian: 'the civilian' };
const LAW = new Set(['sheriff', 'deputy']);

function friendly(victim, by) {
  if (!by) return '';
  if (LAW.has(by) && (LAW.has(victim) || victim === 'civilian')) return 'Friendly fire';
  if (by === 'hostile' && victim === 'hostile') return 'Their own fire';
  return '';
}

const REASON = { cleared: 'Every hostile is down or out of the fight.' };

// Note: the sim reports short phrases; the screen shows them as a sentence.
function reasonText(reason) {
  if (!reason) return '';
  if (REASON[reason]) return REASON[reason];
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${/[.!?]$/.test(reason) ? '' : '.'}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function entry(who, chip, cls, rowCls, detail, flag) {
  const li = el('li', `entry ${rowCls}`);
  li.append(el('span', 'who', who), el('span', `chip ${cls}`, chip));
  if (detail || flag) {
    const d = el('span', 'detail');
    if (flag) d.append(el('b', 'flag', flag), detail ? ' — ' : '');
    d.append(detail || '');
    li.append(d);
  }
  return li;
}

// Note: cause and wound regions without repeating each other, then who fired when the sim knows.
function describe(p) {
  const wounds = p.wounds && p.wounds.length ? p.wounds : [];
  const bits = [];
  if (p.cause) bits.push(p.cause);
  if (wounds.length && !(wounds.length === 1 && p.cause && p.cause.includes(wounds[0]))) bits.push(wounds.join(', '));
  if (p.by) bits.push(`shot by ${WHO[p.by] || p.by}`);
  return bits.join(' — ');
}

function lawEntry(p, place = PLACE.house) {
  const name = nameOf(p);
  const unhurt = p.status === 'ok' && !(p.wounds && p.wounds.length);
  const s = unhurt ? { chip: 'Unhurt', cls: 'fine' } : STATE[p.status] || { chip: p.status, cls: 'down' };
  let detail = describe(p);
  let chip = s.chip;
  // Note: a deputy who left the fight alive is neither unhurt nor down.
  if (p.withdrawn && p.status === 'ok') {
    chip = 'Withdrew';
    detail = `${detail ? `${detail} — ` : ''}left the fight`;
  }
  if (p.diedAfterVictory) {
    chip = 'Died after the fight';
    detail = `${detail ? `${detail} — ` : ''}died of the wound ${place.after}`;
  }
  const row = p.status === 'dead' ? 'is-dead' : unhurt ? 'is-fine' : 'is-down';
  return entry(name, chip, s.cls, row, detail, friendly(p.role, p.by));
}

function stamp(text, cls, delay) {
  const s = el('div', `stamp ${cls}`, text);
  s.style.setProperty('--delay', `${delay}s`);
  return s;
}

// Note: called by main.js once the sim has a final outcome; fills the ids in index.html.
function outcome(r, fallbackSeed) {
  document.body.classList.remove('at-title');
  const win = r.result === 'success';
  $('resultKicker').textContent = `Tombstone · ${win ? 'Success' : 'Failure'}`;
  const place = placeOf(r);
  $('resultTitle').textContent = win ? place.clear : place.lost;
  $('resultReason').textContent = reasonText(r.reason);

  const people = (r.people || []).filter((p) => p.role !== 'hostile');
  const law = $('resultLines');
  law.textContent = '';
  for (const p of people) law.append(lawEntry(p, place));
  if (!people.length) law.append(el('li', 'entry is-fine', 'No report.'));

  const gang = $('resultGang');
  gang.textContent = '';
  (r.hostiles || []).forEach((h, i) => {
    const g = GANG[h.status] || { chip: h.status, cls: 'down' };
    gang.append(entry(`No. ${i + 1}`, g.chip, g.cls, h.status === 'ok' ? 'is-dead' : 'is-down', describe(h), friendly('hostile', h.by)));
  });
  $('resultTally').textContent = `${r.hostilesDown} of ${r.hostilesTotal} taken down`;

  const stamps = $('resultStamps');
  stamps.textContent = '';
  stamps.append(stamp(win ? 'Cleared' : 'Lost', win ? 'win' : 'loss', 0.45));
  let delay = 0.85;
  if (people.some((p) => p.diedAfterVictory)) stamps.append(stamp('Dead after the fight', 'minor', delay));
  else if (people.some((p) => p.role !== 'civilian' && p.status === 'dead')) stamps.append(stamp('Lawman lost', 'minor', delay));
  if (r.civilianDied) stamps.append(stamp('Civilian lost', 'minor', (delay += 0.35)));
  if (people.some((p) => friendly(p.role, p.by))) stamps.append(stamp('Friendly fire', 'minor', (delay += 0.35)));

  const meta = $('resultMeta');
  meta.textContent = '';
  meta.append('Case No. ', el('b', '', r.seed || fallbackSeed || ''), ` · ${Math.round(r.time || 0)} s ${place.where}`);
}

function ready() {
  document.body.classList.remove('is-loading');
  $('begin').disabled = false;
}

function toBriefing() {
  document.body.classList.remove('at-title');
  $('begin').focus({ preventScroll: true });
}

// Note: the title's first live button takes the focus: Continue, else New campaign, else the breach.
function focusTitle() {
  const first = ['continueCampaign', 'newCampaign', 'toBriefing'].map($).find((b) => b && !b.disabled && !b.classList.contains('is-hidden'));
  if (first) first.focus();
}

function toTitle() {
  document.body.classList.add('at-title');
  focusTitle();
}

function visible(id) {
  return !$(id).classList.contains('is-hidden');
}

function init() {
  $('toBriefing').addEventListener('click', toBriefing);
  $('toTitle').addEventListener('click', toTitle);
  // Note: a new case number is a normal change of the seed field, so main.js rebuilds the house from it.
  $('newSeed').addEventListener('click', () => {
    const seed = $('seed');
    seed.value = randomSeed();
    seed.dispatchEvent(new Event('change', { bubbles: true }));
    $('begin').focus();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || document.body.classList.contains('at-title')) return;
    if (visible('overlay') && visible('briefing') && $('stage').classList.contains('is-hidden')) {
      e.preventDefault();
      toTitle();
    }
  });
  // Note: play starts by hiding the stage's hidden class, so leaving the poster is implied.
  new MutationObserver(() => {
    if (!$('stage').classList.contains('is-hidden')) document.body.classList.remove('at-title');
  }).observe($('stage'), { attributes: true, attributeFilter: ['class'] });
  // Note: pause opens with focus on Resume, so Enter and Space work at once.
  new MutationObserver(() => {
    if (visible('pause')) $('resume').focus();
  }).observe($('pause'), { attributes: true, attributeFilter: ['class'] });
  setTimeout(focusTitle, 0);
}

init();

export const ui = { ready, outcome };
