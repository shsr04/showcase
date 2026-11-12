// Note: a small stylized pseudo-voice: one short blip per letter, pitched by speaker. It is not speech; the bubble carries the words.

const BASE = { sheriff: 92, deputy: 128, civilian: 120, hostile: 104 };
// Note: first and second formant per vowel, in Hz; a bandpass at F1 and a hint of F2 is enough for a vowel colour.
const VOWELS = { a: [780, 1200], e: [520, 1850], i: [340, 2250], o: [500, 900], u: [360, 720], y: [420, 1900] };
const HISS = new Set('sfzhxc');
const TICK = new Set('ptkbdgq');
const HUM = new Set('lmnrwvj');
const MAX_BLIPS = 36;

// Note: small deterministic hash so a letter in a place always gets the same wobble.
const wobble = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  return (((h >>> 0) % 1000) / 1000) * 2 - 1;
};

// Note: pitch comes from the role; a hostile or a civilian shifts a few semitones by id so voices differ.
export function voiceFor(role, id = 0, kind = null) {
  const base = BASE[role] || BASE.hostile;
  const shift = role === 'hostile' ? wobble(id * 7 + 3) * 4 : 0;
  const f0 = base * (kind === 'woman' ? 1.75 : 1) * 2 ** (shift / 12);
  return { f0, wave: role === 'deputy' ? 'square' : 'sawtooth', quick: role === 'hostile' ? 0.92 : 1 };
}

// Note: returns blips as { at, dur, f0, f1, gain, type: 'vowel' | 'hiss' | 'tick' | 'hum', form: [f1, f2] }; times in seconds from the start of the line.
export function blipsFor(text, voice, mode = 'normal') {
  const out = [];
  const shout = mode === 'shout';
  const whisper = mode === 'whisper';
  const pace = (shout ? 0.056 : whisper ? 0.074 : 0.065) * voice.quick;
  const base = voice.f0 * (shout ? 1.25 : 1);
  const lower = String(text).toLowerCase();
  const last = lower.length - 1;
  const mark = lower.trim().slice(-1);
  let t = 0;
  for (let i = 0; i <= last && out.length < MAX_BLIPS; i++) {
    const c = lower[i];
    if (c === ' ') {
      t += pace;
      continue;
    }
    if (c === '.' || c === ',' || c === '!' || c === '?') {
      t += pace * 1.8;
      continue;
    }
    const left = (last - i) / Math.max(1, last);
    // Note: a line ends falling, a question rises, and a shout leans on its first letters.
    let bend = wobble(i * 31 + c.charCodeAt(0)) * 1.1 + left * 3 - 1.5;
    if (mark === '?') bend += (1 - left) * 4.5;
    else if (mark === '.' || mark === '!') bend -= (1 - left) * 3;
    const f0 = base * 2 ** (bend / 12);
    const gain = (shout ? 1 : whisper ? 0.55 : 0.8) * (i === 0 ? 1.15 : 1);
    if (VOWELS[c]) {
      out.push({ at: t, dur: pace * 1.15, f0, f1: f0 * 0.96, gain, type: whisper ? 'hiss' : 'vowel', form: VOWELS[c] });
      t += pace;
    } else if (HISS.has(c)) {
      out.push({ at: t, dur: pace * 0.9, f0, f1: f0, gain: gain * 0.55, type: 'hiss', form: [5200, 7000] });
      t += pace * 0.8;
    } else if (TICK.has(c)) {
      out.push({ at: t, dur: 0.022, f0, f1: f0, gain: gain * 0.7, type: 'tick', form: [1800, 3200] });
      t += pace * 0.6;
    } else if (HUM.has(c)) {
      out.push({ at: t, dur: pace * 0.8, f0: f0 * 0.9, f1: f0 * 0.85, gain: gain * 0.6, type: whisper ? 'hiss' : 'hum', form: [380, 1100] });
      t += pace * 0.7;
    }
  }
  return out;
}

export const lineSeconds = (blips) => (blips.length ? blips[blips.length - 1].at + blips[blips.length - 1].dur : 0);
