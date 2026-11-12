// Note: a voice reaches everyone who hears it, and a hand signal needs the deputy's eyes.

import { dist } from './rand.js';
import { shareZones } from './tactical-zones.js';

const KINDS = ['', 'cover', 'hold', 'push', 'fallback'];
const LINES = ['', 'Cover me.', 'Hold here.', 'Push.', 'Fall back.'];
const SIGNAL_RANGE = 14;

export function runCommand(sim, n) {
  const kind = KINDS[n];
  const s = sim.sheriff;
  const deputies = sim.deputies;
  if (!kind || s.status !== 'ok' || s.carried) return;
  const method = sim.signal ? 'signal' : 'voice';
  // Note: each deputy perceives the call on his own.
  let got;
  if (method === 'signal') {
    got = deputies.filter((d) => d.status === 'ok' && !d.withdrawn && !d.passive && dist(s, d) <= SIGNAL_RANGE && sim.sees(d, s));
    sim.events.push({ type: 'signal', actorId: s.id, kind, seen: got.length > 0 });
  } else {
    const heard = sim.say(s, LINES[n], sim.input.slow ? 'whisper' : 'shout');
    got = deputies.filter((d) => d.status === 'ok' && !d.withdrawn && !d.passive && heard.some((h) => h.id === d.id));
    if (!sim.input.slow) for (const d of got) shareZones(s, d);
  }
  sim.events.push({ type: 'command', actorId: s.id, kind, method, perceived: got.length > 0, perceivedBy: got.map((d) => d.id) });
  for (const d of got) {
    // Note: orders are advice the deputy weighs on his next thought, and a refusal keeps the order before it.
    if (!d.ai.order?.fresh) d.ai.prevOrder = d.ai.order;
    d.ai.order = { kind, method, t: sim.time, fresh: true };
  }
}
