// Note: entry point; integer zoom, title screen, Phaser boot, end screens and the desktop-only notice.

import { VIEW_W, VIEW_H, NAME_KEY } from './config.js';
import { normSeed, randomSeed } from './rand.js';
import { GameScene } from './game.js';
import { loadSave, deleteSave, saveSummary } from './save.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const app = { game: null, scene: null, audio: null, zoom: 4, booted: false };
window.__ig = app;

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.classList.remove('is-hidden');
}

window.addEventListener('error', (e) => fatal(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => fatal(`Error: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));

function fitZoom() {
  const z = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
  app.zoom = z;
  document.documentElement.style.setProperty('--z', String(z));
}

function phoneLike() {
  if (params.has('desktop')) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 360;
}

function showTitle() {
  $('stage').classList.add('is-hidden');
  $('end').classList.add('is-hidden');
  $('title').classList.remove('is-hidden');
  $('newForm').classList.add('is-hidden');
  $('titleModes').classList.remove('is-hidden');
  const save = loadSave();
  const cont = $('btnContinue');
  if (save) {
    cont.hidden = false;
    $('titleSave').textContent = saveSummary(save);
    cont.classList.add('primary');
    $('btnNew').classList.remove('primary');
  } else {
    cont.hidden = true;
    $('titleSave').textContent = '';
    $('btnNew').classList.add('primary');
  }
}

function startScene(data) {
  $('title').classList.add('is-hidden');
  $('end').classList.add('is-hidden');
  $('stage').classList.remove('is-hidden');
  if (!app.audio) app.audio = createAudio();
  app.audio.start();
  const run = () => {
    if (app.game.scene.isActive('game')) app.game.scene.stop('game');
    app.game.scene.start('game', { ...data, app });
  };
  if (app.booted) run();
  else app.pending = run;
}

// Note: shared by death, act end and quit; buttons are built per screen.
export function showEnd({ kicker, title, copy, lines, stats, buttons }) {
  $('stage').classList.add('is-hidden');
  $('end').classList.remove('is-hidden');
  $('endKicker').textContent = kicker || '';
  $('endKicker').hidden = !kicker;
  $('endTitle').textContent = title;
  $('endCopy').textContent = copy || '';
  $('endCopy').hidden = !copy;
  const ep = $('endLines');
  ep.innerHTML = '';
  ep.hidden = !lines || !lines.length;
  for (const text of lines || []) {
    const p = document.createElement('p');
    p.textContent = text;
    ep.append(p);
  }
  const dl = $('endStats');
  dl.innerHTML = '';
  for (const [k, v] of stats || []) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  const row = $('endButtons');
  row.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn${b.primary ? ' primary' : ''}`;
    el.textContent = b.label;
    el.addEventListener('click', b.run);
    row.append(el);
  }
}

app.showTitle = showTitle;
app.showEnd = showEnd;
app.startScene = startScene;
app.stopScene = () => {
  if (app.game && app.game.scene.isActive('game')) app.game.scene.stop('game');
};

function wireTitle() {
  $('btnContinue').addEventListener('click', () => {
    const save = loadSave();
    if (save) startScene({ mode: 'continue', save });
  });
  $('btnNew').addEventListener('click', () => {
    $('titleModes').classList.add('is-hidden');
    $('newForm').classList.remove('is-hidden');
    $('optName').value = localStorage.getItem(NAME_KEY) || '';
    $('optSeed').value = params.get('seed') || '';
    $('newWarn').textContent = loadSave() ? 'Deletes the saved run.' : '';
    $('optName').focus();
  });
  $('btnCancel').addEventListener('click', showTitle);
  $('newForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ($('optName').value || 'Courier').trim().slice(0, 16) || 'Courier';
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Note: storage can be blocked; the name still works for this run.
    }
    const raw = $('optSeed').value.trim();
    const seed = raw ? normSeed(raw) : randomSeed();
    deleteSave();
    startScene({ mode: 'new', name, seed });
  });
  $('btnTutorial').addEventListener('click', () => startScene({ mode: 'tutorial', name: 'Courier', seed: 'TUTORIAL' }));
}

function boot() {
  fitZoom();
  window.addEventListener('resize', fitZoom);
  if (phoneLike()) {
    $('title').classList.add('is-hidden');
    $('notice').classList.remove('is-hidden');
    return;
  }
  if (typeof Phaser === 'undefined') {
    fatal('Phaser failed to load (vendor/phaser.min.js).');
    return;
  }
  wireTitle();
  showTitle();
  app.game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0d0b0a',
    scale: { mode: Phaser.Scale.NONE, width: VIEW_W, height: VIEW_H },
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    fps: { target: 60, smoothStep: true },
    banner: false,
    scene: [GameScene],
    callbacks: {
      postBoot: () => {
        app.booted = true;
        $('bootText').textContent = '';
        if (app.pending) {
          const run = app.pending;
          app.pending = null;
          run();
        }
      },
    },
  });
  // Note: auto-start hooks for headless checks: ?play=new&seed=X or ?play=tutorial.
  const play = params.get('play');
  if (play === 'new') startScene({ mode: 'new', name: params.get('name') || 'Tester', seed: normSeed(params.get('seed') || randomSeed()) });
  else if (play === 'tutorial') startScene({ mode: 'tutorial', name: 'Courier', seed: 'TUTORIAL' });
  else if (play === 'continue' && loadSave()) startScene({ mode: 'continue', save: loadSave() });
}

const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('16px VT323'), new Promise((r) => setTimeout(r, 2000))]) : Promise.resolve();
fontReady.catch(() => {}).then(boot);
