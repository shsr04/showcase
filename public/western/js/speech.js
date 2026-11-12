// Note: which lines the followed character hears, as text with a direction; the view shows them as speech bubbles.

const CRIES = ['Ah!', 'Argh!', 'Ugh!'];
const TEAM_RANGE = 9;
const TEAM_LEVEL = 62;
const FLOOR_LOSS = 14;

const isLawman = (a) => a && (a.role === 'sheriff' || a.role === 'deputy');

// Note: a say() line is a voice event followed by its heard event; a voice() line has no sound of its own.
// Note: a cue is { actorId, text, mode, own, dir, level, muffle }, and dir is the world angle the line came from.
// Note: mode 'signal' is a gesture; it is silent and only seen, so the view shows it only while its actor is in sight.
export function speechCues(events, follow, actorOf) {
  const cues = [];
  if (!follow) return cues;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = events[i + 1];
    if (e.type === 'voice') {
      if (!e.text) continue;
      const speaker = actorOf(e.actorId);
      if (!speaker) continue;
      if (next && next.type === 'heard' && (next.kind === 'shout' || next.kind === 'whisper')) {
        cues.push({ actorId: speaker.id, role: speaker.role, kind: speaker.kind || null, text: e.text, mode: next.kind, own: !!next.own, dir: next.dir, level: next.level, muffle: next.muffle || 0 });
        continue;
      }
      // Note: a spoken line the sim did not report as heard is silent for the followed character.
      if (e.spoken) continue;
      // Note: nobody hears a hostile line the sim did not report; lawmen near each other hear each other.
      if (speaker.id === follow.id) {
        cues.push({ actorId: speaker.id, role: speaker.role, kind: speaker.kind || null, text: e.text, mode: 'normal', own: true, dir: follow.facing || 0, level: TEAM_LEVEL, muffle: 0 });
      } else if (isLawman(speaker)) {
        const d = Math.hypot(speaker.x - follow.x, speaker.y - follow.y);
        const apart = speaker.floor !== follow.floor;
        if (d > TEAM_RANGE || (apart && d > TEAM_RANGE / 2)) continue;
        cues.push({
          actorId: speaker.id, role: speaker.role, kind: speaker.kind || null, text: e.text, mode: 'normal', own: false, dir: Math.atan2(speaker.y - follow.y, speaker.x - follow.x),
          level: TEAM_LEVEL - 20 * Math.log10(Math.max(1, d)) - (apart ? FLOOR_LOSS : 0), muffle: apart ? 0.6 : 0.05,
        });
      }
    } else if (e.type === 'heard' && e.kind === 'cry') {
      const prev = events[i - 1];
      const victim = prev && prev.type === 'hit' ? actorOf(prev.actorId) : null;
      // Note: a spoken line right after the hit replaces the grunt.
      if (victim && next && next.type === 'voice' && next.actorId === victim.id && next.text) continue;
      cues.push({ actorId: victim ? victim.id : null, role: victim ? victim.role : 'hostile', kind: victim ? victim.kind || null : null, cry: true, text: CRIES[((victim ? victim.id : 0) + i) % CRIES.length], mode: 'shout', own: !!e.own, dir: e.dir, level: e.level, muffle: e.muffle || 0 });
    }
  }
  return cues;
}

// Note: a bubble stays long enough to read, counted in sim seconds so a pause freezes it.
export function bubbleSeconds(text) {
  return Math.min(4.2, 1.5 + text.length * 0.06);
}
