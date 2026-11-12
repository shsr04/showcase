// Note: entry point; smooth fractional zoom, briefing, Phaser boot, pause and the outcome screen. No HUD during play.

import { SCALE, VIEW_W, VIEW_H } from './config.js';
import { normSeed, randomSeed } from './rand.js';
import { Input } from './input.js';
import { dynamiteSticks, showHonours } from './honours.js';
import { createAudio } from './audio.js';
import { createMenuMusic } from './menu-music.js';
import { GameScene } from './game.js';
import { ui } from './ui.js';
import { guardSecondaryClick } from './secondary-click.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const app = {
  game: null,
  sim: null,
  Sim: null,
  input: null,
  audio: null,
  music: null,
  stage: $('stage'),
  seed: '',
  playing: false,
  paused: false,
  booted: false,
  zoom: 2,
};
// Note: window.__ws gives headless checks the live sim and the app object.
window.__ws = { app, get sim() { return app.sim; } };

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.classList.remove('is-hidden');
}

window.addEventListener('error', (e) => fatal(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => fatal(`Error: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));

// Note: app.zoom is CSS pixels per game pixel and may be a fraction; the stage is the largest whole-pixel 16:9 box that fits the window.
function fitZoom() {
  const w = Math.floor(Math.min(window.innerWidth, (window.innerHeight * VIEW_W) / VIEW_H));
  const z = Math.max(0.1, w / VIEW_W);
  app.zoom = z;
  const root = document.documentElement.style;
  root.setProperty('--z', String(z));
  root.setProperty('--vw', String(VIEW_W));
  root.setProperty('--vh', String(VIEW_H));
  root.setProperty('--s', String(SCALE));
}

function phoneLike() {
  if (params.has('desktop')) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 360;
}

// Note: a new Sim per attempt; the seed rebuilds the same house and hostile placement.
function prepare(seed) {
  app.seed = normSeed(seed);
  // Note: item 499: the Ironman reward carries into Quick Breach too.
  app.sim = new app.Sim(app.seed, { dynamite: dynamiteSticks() });
  showHonours();
  $('seed').value = app.seed;
  $('tip').textContent = app.sim.rumor ? 'Word is a civilian may be inside. Watch your fire.' : 'No word of anyone but the men inside. Watch your fire.';
  ui.ready();
  $('result').classList.add('is-hidden');
  $('pause').classList.add('is-hidden');
  $('briefing').classList.remove('is-hidden');
  $('overlay').classList.remove('is-hidden');
  $('stage').classList.add('is-hidden');
  app.playing = false;
  app.paused = false;
  app.input.enabled = false;
  app.input.clear();
  app.input.release();
  app.music.setTrack('menu');
  app.music.start();
  if (app.game && app.game.scene.isActive('game')) app.game.scene.stop('game');
  setTimeout(() => $('begin').focus(), 0);
}

function startScene() {
  const run = () => {
    if (app.game.scene.isActive('game')) app.game.scene.stop('game');
    app.game.scene.start('game', { sim: app.sim, app });
  };
  if (app.booted) run();
  else app.pending = run;
}

function begin() {
  if (!app.Sim) return;
  const wanted = normSeed($('seed').value);
  if (wanted !== app.seed || !app.sim || app.sim.time > 0) prepare(wanted);
  if (!app.audio) app.audio = createAudio();
  if (app.menuSound) app.audio.setMuted(app.menuSound.isMuted());
  app.music.stop();
  app.audio.start();
  $('overlay').classList.add('is-hidden');
  $('stage').classList.remove('is-hidden');
  app.playing = true;
  app.paused = false;
  app.input.clear();
  app.input.resetStance();
  app.input.enabled = true;
  app.input.capture();
  startScene();
}

function setPaused(on) {
  if (!app.playing || app.paused === on) return;
  app.paused = on;
  app.input.enabled = !on;
  app.input.clear();
  if (on) app.input.release();
  else app.input.capture();
  $('pause').classList.toggle('is-hidden', !on);
  $('mute').textContent = app.audio && app.audio.isMuted() ? 'Sound: off' : 'Sound: on';
  if (app.audio) {
    if (on) app.audio.suspend();
    else app.audio.start();
  }
}

// Note: campaign mode (js/camp/cui.js) plays a Sim it built itself and takes it back when the scene ends or the player pulls out.
function playCampaign(sim, done, labels) {
  if (!app.Sim) return;
  if (!app.audio) app.audio = createAudio();
  app.music.stop();
  app.audio.start();
  app.sim = sim;
  app.seed = sim.seed;
  app.campaignRun = { done, abandonText: $('abandon').textContent };
  $('abandon').textContent = labels.pull;
  $('overlay').classList.add('is-hidden');
  $('pause').classList.add('is-hidden');
  $('stage').classList.remove('is-hidden');
  app.playing = true;
  app.paused = false;
  app.input.clear();
  app.input.resetStance();
  app.input.enabled = true;
  app.input.capture();
  startScene();
}

function endCampaignRun(sim, how) {
  const run = app.campaignRun;
  app.campaignRun = null;
  app.playing = false;
  app.paused = false;
  app.input.enabled = false;
  app.input.clear();
  app.input.release();
  app.music.start();
  if (app.audio) app.audio.suspend();
  $('abandon').textContent = run.abandonText;
  $('pause').classList.add('is-hidden');
  $('stage').classList.add('is-hidden');
  // Note: the scene is stopped on the next tick, after the call that ended it has returned.
  setTimeout(() => {
    if (app.game.scene.isActive('game')) app.game.scene.stop('game');
  }, 0);
  run.done(sim, how);
}

// Note: back to the poster from a campaign; the quick breach starts from a fresh case number.
app.toTitle = () => {
  prepare(randomSeed());
  document.body.classList.add('at-title');
};
app.playCampaign = playCampaign;

// Note: called by the scene when sim.outcome.final is set.
app.finish = (sim) => {
  if (app.campaignRun) {
    endCampaignRun(sim, 'finish');
    return;
  }
  const r = sim.report();
  app.playing = false;
  app.input.enabled = false;
  app.input.clear();
  app.input.release();
  app.music.start();
  if (app.audio) app.audio.suspend();
  ui.outcome(r, app.seed);
  $('briefing').classList.add('is-hidden');
  $('pause').classList.add('is-hidden');
  $('result').classList.remove('is-hidden');
  $('overlay').classList.remove('is-hidden');
  setTimeout(() => $('fresh').focus(), 0);
};

function wire() {
  $('briefing').addEventListener('submit', (e) => {
    e.preventDefault();
    begin();
  });
  $('seed').addEventListener('change', () => prepare($('seed').value));
  $('fresh').addEventListener('click', () => prepare(randomSeed()));
  $('replay').addEventListener('click', () => prepare(app.seed));
  $('resume').addEventListener('click', () => setPaused(false));
  $('mute').addEventListener('click', () => {
    if (!app.audio) return;
    app.audio.setMuted(!app.audio.isMuted());
    if (app.menuSound) app.menuSound.setMuted(app.audio.isMuted());
    $('mute').textContent = app.audio.isMuted() ? 'Sound: off' : 'Sound: on';
  });
  $('abandon').addEventListener('click', () => {
    if (app.campaignRun) endCampaignRun(app.sim, 'pull');
    else prepare(app.seed);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && app.playing) {
      e.preventDefault();
      setPaused(!app.paused);
    }
  });
  window.addEventListener('blur', () => {
    if (app.playing && !app.paused) setPaused(true);
  });
  // Note: leaving mid-attempt asks first; browsers may still close the tab on Ctrl+W, Ctrl+T or Ctrl+N.
  window.addEventListener('beforeunload', (e) => {
    if (!app.playing) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

async function loadSim() {
  const mod = await import('./sim.js');
  app.Sim = mod.Sim;
}

async function boot() {
  guardSecondaryClick();
  fitZoom();
  window.addEventListener('resize', fitZoom);
  if (phoneLike()) {
    $('overlay').classList.add('is-hidden');
    $('notice').classList.remove('is-hidden');
    return;
  }
  if (typeof Phaser === 'undefined') {
    fatal('Phaser failed to load (vendor/phaser.min.js).');
    return;
  }
  app.input = new Input($('stage'), VIEW_W, VIEW_H);
  app.music = createMenuMusic();
  window.addEventListener('pointerdown', () => app.music.unlock(), true);
  window.addEventListener('keydown', () => app.music.unlock(), true);
  document.addEventListener('visibilitychange', () => app.music.setVisible(!document.hidden));
  app.input.onUnlock = () => { if (app.playing && !app.paused) setPaused(true); };
  wire();
  // Note: item 499: the G row of the controls shows only once dynamite is earned.
  showHonours();
  try {
    await loadSim();
  } catch (err) {
    fatal(`The simulation failed to load: ${err.message}`);
    return;
  }
  try {
    (await import('./camp/cui.js')).initCamp(app);
  } catch (err) {
    fatal(`The campaign failed to load: ${err.message}`);
  }
  app.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: false,
    antialias: true,
    antialiasGL: false,
    roundPixels: false,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.NONE, width: VIEW_W, height: VIEW_H },
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    fps: { target: 60, smoothStep: true },
    banner: false,
    scene: [GameScene],
    callbacks: {
      postBoot: () => {
        app.booted = true;
        if (app.pending) {
          const run = app.pending;
          app.pending = null;
          run();
        }
      },
    },
  });
  prepare(params.get('seed') || randomSeed());
  if (params.get('play') === '1') begin();
}

boot();
