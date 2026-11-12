// Note: original suspense loop for a Western duel, synthesised in this file with no samples.
// Note: render a WAV with `node scripts/compose-western-duel.mjs /tmp/western-duel.wav`.
// Note: make the shipped MP3 with `ffmpeg -y -i /tmp/western-duel.wav -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/western/audio/duel-suspense.mp3`.
import { writeFileSync } from 'node:fs';

const output = process.argv[2];
if (!output) throw new Error('Pass an output WAV path');
const rate = 44100, beat = 60 / 64, bars = 16, length = Math.round(bars * 4 * beat * rate);
const left = new Float32Array(length), right = new Float32Array(length);
let seed = 146721;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const mix = (sample, i, pan = 0) => {
  if (i < 0 || i >= length) return;
  left[i] += sample * Math.sqrt((1 - pan) / 2);
  right[i] += sample * Math.sqrt((1 + pan) / 2);
};
// Note: soft, muted plucked strings with long spaces between notes.
function pluck(note, start, duration, gain, pan) {
  const freq = hz(note), samples = Math.round(duration * rate), offset = Math.round(start * rate);
  let filtered = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    filtered += (random() * 2 - 1 - filtered) * 0.18;
    const env = Math.min(1, t / 0.065) * Math.exp(-t * 1.3) * Math.min(1, (duration - t) / 0.3);
    const wave = Math.sin(2 * Math.PI * freq * t) + 0.12 * Math.sin(4 * Math.PI * freq * t) * Math.exp(-t * 3) + filtered * Math.exp(-t * 18) * 0.04;
    mix(wave * env * gain, offset + i, pan);
  }
}
// Note: a low E minor progression with a held, uneasy bass and an occasional answer.
const roots = [45, 45, 41, 40, 45, 45, 43, 40, 41, 41, 45, 45, 38, 41, 40, 45];
const melody = [69, null, 72, 71, 69, 76, 74, null, 72, 69, 76, null, 74, 72, 71, 69];
for (let bar = 0; bar < bars; bar++) {
  const start = bar * 4 * beat;
  pluck(roots[bar] - 5, start, 3.5, 0.18, -0.3);
  pluck(roots[bar] + 2, start + beat * 2.5, 2.2, 0.08, 0.25);
  if (melody[bar] !== null) pluck(melody[bar] - 5, start + beat * 1.3, 2.6, 0.11, 0.28);
}
// Note: low, slow undulation; it stays below the notes and leaves space for gunfire.
for (let i = 0; i < length; i++) {
  const t = i / rate;
  const drone = Math.sin(2 * Math.PI * hz(28) * t) * 0.018 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.09 * t));
  mix(drone, i);
}
// Note: dark early reflections followed by diffuse, quieter echoes give the strings distance.
const dryL = left.slice(), dryR = right.slice();
const echoes = [[0.16, 0.21], [0.29, 0.17], [0.43, 0.14], [0.61, 0.11], [0.89, 0.08], [1.21, 0.05]]
  .map(([seconds, gain]) => [Math.round(rate * seconds), gain]);
const lowpass = 1 - Math.exp(-2 * Math.PI * 900 / rate);
let filteredL = 0, filteredR = 0;
for (let i = 0; i < length; i++) {
  let l = dryL[i] * 0.8, r = dryR[i] * 0.8;
  for (const [delay, gain] of echoes) if (i >= delay) {
    l += dryR[i - delay] * gain;
    r += dryL[i - delay] * gain;
  }
  filteredL += (l - filteredL) * lowpass;
  filteredR += (r - filteredR) * lowpass;
  const fade = Math.max(0, Math.min(1, i / (rate * 0.6), (length - 1 - i) / (rate * 0.9)));
  left[i] = filteredL * fade * 1.9;
  right[i] = filteredR * fade * 1.9;
}
const data = Buffer.alloc(44 + length * 4);
data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
}
writeFileSync(output, data);
