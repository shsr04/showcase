// Note: the tunes are original instrumental loops; browsers may require a gesture before playback.
// Note: each tune has its file and its playing volume; the duel tune is the quietest.
const TRACKS = {
  menu: { src: '../audio/frontier-menu.mp3?v=3', volume: 0.6 },
  saloon: { src: '../audio/saloon-piano.mp3', volume: 0.42 },
  duel: { src: '../audio/duel-suspense.mp3', volume: 0.196 },
};
export function createMenuMusic(makeAudio = (track) => new Audio(new URL(TRACKS[track].src, import.meta.url).href)) {
  let audio = null;
  // Note: the menu tune is kept while a scene tune plays, so it resumes where it left off.
  let menuAudio = null;
  let track = 'menu';
  let active = false;
  let muted = false;
  let visible = true;
  // Note: item 448: playing speed of the tune; below 1 the pitch falls with it, as in a slowed record.
  let rate = 1;
  const pace = () => {
    if (!audio) return;
    try {
      audio.preservesPitch = false;
      audio.playbackRate = rate;
    } catch (_) { /* Note: a stub or an old browser keeps the tune at its own pace. */ }
  };

  function attempt() {
    if (!active || muted || !visible) return;
    try {
      if (!audio) {
        audio = makeAudio(track);
        if (!audio) return;
        audio.loop = true;
        audio.volume = TRACKS[track].volume;
        audio.preload = 'auto';
        pace();
      }
      if (!audio.paused) return;
      const playing = audio.play();
      if (playing && playing.catch) playing.catch(() => {});
    } catch (_) { /* Note: audio is optional if unavailable or blocked by the browser. */ }
  }

  return {
    get playing() { return !!audio && !audio.paused; },
    get currentTime() { return audio?.currentTime || 0; },
    get track() { return track; },
    get rate() { return rate; },
    setRate(value) {
      rate = Number.isFinite(value) ? Math.min(1, Math.max(0.25, value)) : 1;
      pace();
    },
    setTrack(next) {
      if (!Object.hasOwn(TRACKS, next) || next === track) return;
      if (audio) audio.pause();
      if (track === 'menu') menuAudio = audio;
      audio = next === 'menu' ? menuAudio : null;
      track = next;
      attempt();
    },
    start() { active = true; attempt(); },
    stop() { active = false; if (audio) audio.pause(); },
    unlock() { attempt(); },
    setMuted(value) {
      muted = !!value;
      if (muted && audio) audio.pause();
      else attempt();
    },
    setVisible(value) {
      visible = !!value;
      if (!visible && audio) audio.pause();
      else attempt();
    },
  };
}
