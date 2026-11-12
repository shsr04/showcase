// Note: the death ceremony without a DOM, world data or storage: the order of the mourned, the words of each card and the time each card holds the player.

// Note: ms until the last line of a card has landed; the stagger and lead are the same numbers as --step and --lead in style.css (a test compares them).
export const STAGE = {
  crew: { lead: 120, step: 200, fade: 260, lines: 5, hold: 1200 },
  star: { lead: 200, step: 340, fade: 320, lines: 6, hold: 2500, tolls: [1250, 2500] },
  pass: { lead: 150, step: 260, fade: 300, lines: 5, hold: 1500 },
};

// Note: when the last line of a stage is fully in.
export const landsAt = (s) => s.lead + (s.lines - 1) * s.step + s.fade;

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const article = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

export function listOf(items) {
  const xs = items.filter(Boolean);
  if (xs.length < 2) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

// Note: the text of the plain succession note, shared by the result sheet, the news toast and the star card.
export function successionText(ev) {
  if (ev.kind === 'deputy-promoted') return `${ev.name} takes up the star.`;
  return ev.reason || 'The office changes hands.';
}

// Note: a death entry carries its role and, for a sheriff, the succession event that follows it in the same list of events.
export function pairGrief(deaths, events, roleOf = () => null) {
  const list = events || [];
  const used = new Set();
  return (deaths || []).map((d) => {
    const role = d.role || roleOf(d) || null;
    let succession = d.succession || null;
    if (role === 'sheriff' && !succession) {
      const at = list.findIndex((e) => e.type === 'death' && (e === d || (d.charId != null ? e.charId === d.charId : e.name === d.name)));
      const i = list.findIndex((e, k) => k > at && e.type === 'succession' && !used.has(k));
      if (i >= 0) {
        used.add(i);
        succession = list[i];
      }
    }
    return { ...d, role, succession };
  });
}

// Note: the index of the next card: the crew first, in the order they fell, and the sheriff last so the star passes at the end.
export function pickGrief(queue, roleOf = () => null) {
  if (!queue.length) return -1;
  const i = queue.findIndex((d) => (d.role || roleOf(d)) !== 'sheriff');
  return i < 0 ? 0 : i;
}

// Note: when the sheriff is among the dead waiting to be mourned, the crew's grave scenes are skipped and only the sheriff's plays; returns the queue to play.
export function skipCrewForSheriff(queue, roleOf = () => null) {
  return queue.some((d) => (d.role || roleOf(d)) === 'sheriff') ? queue.filter((d) => (d.role || roleOf(d)) === 'sheriff') : queue;
}

// Note: the title and the way of dying; the place and the time are given only when the fallen are on the books.
export function ripText({ title, cause, where, when }) {
  const how = `${cap1(cause || 'fell')}${where && when ? `, ${where}, ${when}` : ''}.`;
  return [title ? `${title}.` : null, how].filter(Boolean).join(' ');
}

// Note: only what the books hold: the weapons they carried and the weekly wages they were owed.
export function leaveText({ kit = [], owed = '' } = {}) {
  const parts = [];
  if (kit.length) parts.push(`Carried ${listOf(kit.map(article))}.`);
  if (owed) parts.push(`Owed ${owed} in wages.`);
  return parts.join(' ');
}

// Note: whole days from the day they joined the office to the day they fell; a save without the day of joining counts from the start of the campaign.
export function serviceDays(fellMin, joinedMin) {
  const from = Number.isFinite(joinedMin) ? joinedMin : 0;
  return Math.max(0, Math.floor((fellMin - from) / 1440));
}

export function serviceText({ days, cases = 0 }) {
  const time = days < 1 ? 'Less than a day in the office' : `${plural(days, 'day', 'days')} in the office`;
  return `${time}${cases > 0 ? `; rode on ${plural(cases, 'settled case', 'settled cases')}` : ''}.`;
}

export const STAR_CLOSING = 'The office is without a sheriff.';

// Note: the second beat of the sheriff's ceremony, from the succession event the campaign emitted; who is the display name of the new sheriff when the crew knows it.
export function passText(ev, who) {
  const name = who || ev.name;
  if (ev.kind === 'deputy-promoted') return { ended: false, title: name, line: 'The deputy takes up the star.', tail: '' };
  return { ended: true, title: 'No one takes up the star', line: ev.reason || 'No one is left to wear the star.', tail: 'The revenge dies with the sheriff.' };
}
