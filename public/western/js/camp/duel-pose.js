// Note: what the people of a duel look like and say, from the sim's view alone; nothing here decides a rule.
import { unit } from '../rand.js';
import { reactOfHit, reactFrame, fallFrame, fallSide, FALL_T } from '../anim.js';

export const RECOIL = 0.14;
export const since = (view, who, hits) => (view.shots || []).reduce((best, e) => (e.who === who && (!hits || e.hit) ? Math.min(best, view.time - e.time) : best), Infinity);

// Note: the frame the person painter needs for one side of the duel, from the sim's view alone; the draw is shown by the arm and the gun, never by a flag.
export function poseOf(view, who, t = view.time) {
  const other = who === 'player' ? 'opponent' : 'player';
  const status = view[`${who}Status`] || 'ok';
  const held = !view.weaponHeld || view.weaponHeld[who] !== false;
  const yielded = who === 'player' ? !!view.surrendered : !!view.opponentYielded;
  const phase = view[who];
  const bloody = status !== 'ok' || (view.shots || []).some((e) => e.who === other && e.hit);
  const base = { weapon: 'none', stow: held ? 'handgun' : '', act: 'none', ph: 0, bloody };
  const lastHit = view.shots && view.shots.filter((e) => e.who === other && e.hit).pop();
  const facing = view.facing?.[who] ?? (who === 'player' ? 0 : Math.PI);
  const reaction = view.reactions?.[who] || (lastHit && reactOfHit({ region: lastHit.hit }, lastHit.time, who === 'player' ? Math.PI : 0));
  const rf = reactFrame(reaction, t, facing);
  const flinch = rf ? { ...rf, hit: rf.hit || undefined } : {};
  if (status !== 'ok') {
    const at = view.fallenAt?.[who];
    const ff = fallFrame(at == null ? FALL_T : t - at, fallSide({ id: who === 'player' ? 1 : 2, react: reaction, facing }));
    return { ...base, state: ff.standing ? 'ok' : status === 'dead' ? 'dead' : 'down', stance: ff.standing ? 'crouch' : 'stand', hit: ff.standing ? (rf?.hit || 'chest') : '', rot: ff.rot, scale: ff.scale, stow: '' };
  }
  if (yielded) return { ...base, act: 'vault', ph: 2, ...flinch };
  if (!held) {
    const lifting = view.pickingUp && view.pickingUp[who];
    return { ...base, act: lifting ? 'lift' : 'cower', ph: lifting ? Math.floor(t * 3) % 2 : 0, ...flinch };
  }
  if (phase === 'holstered') {
    const cue = who === 'opponent' ? view.cueKind : view.playerCueKind;
    const on = who === 'opponent' ? view.cue : view.playerCue;
    if (on && cue === 'hand') return { ...base, act: 'switch', ph: 1, ...flinch };
    if (on) return { ...base, nod: 2 + (Math.floor(t * 4) % 2), ...flinch };
    return { ...base, ...flinch };
  }
  if (phase === 'drawing') {
    const p = view[`${who}DrawProgress`] || 0;
    const third = Math.min(2, Math.floor(p * 3));
    return { ...base, weapon: third === 0 ? 'none' : 'handgun', stow: third === 0 ? 'handgun' : '', act: 'switch', ph: [1, 0, 2][third], ...flinch };
  }
  if (who === 'player' && view.reloading) return { ...base, weapon: 'handgun', stow: '', act: 'reload', ph: Math.floor(t * 5) % 8, ...flinch };
  const kick = since(view, who, false) < RECOIL;
  return { ...base, weapon: 'handgun', stow: '', act: kick ? 'recoil' : 'none', ...flinch };
}

// Note: a side is dead by the campaign's own rule: dead status, a death in progress, or a fatal wound in the report.
export function deadOf(view, who, report = null) {
  const wounds = (report && (who === 'player' ? report.wounds : report.opponentWounds)) || [];
  const dying = !!report && report[`${who}Dying`] === true;
  return view[`${who}Status`] === 'dead' || dying || wounds.some((w) => w.fatal);
}

// Note: the words of the closing beat, who fell and who gave way; two fallen men are named together and a dead one is named before one who is only down.
export function outcomeOf(view, names, report = null) {
  const dead = (who) => deadOf(view, who, report);
  const down = (who) => view[`${who}Status`] === 'incapacitated' && !dead(who);
  const name = (who) => names[who];
  const wounds = (who) => (report && (who === 'player' ? report.wounds : report.opponentWounds)) || [];
  if (dead('player') && dead('opponent')) return { who: null, kind: 'both', text: 'Both men fall dead.' };
  if (down('player') && down('opponent')) return { who: null, kind: 'both-down', text: 'Both men are shot down.' };
  for (const who of ['opponent', 'player']) {
    if (!dead(who)) continue;
    const other = who === 'player' ? 'opponent' : 'player';
    return { who, kind: 'dead', text: down(other) ? `${name(who)} falls dead and ${name(other)} is shot down.` : `${name(who)} falls dead.` };
  }
  for (const who of ['opponent', 'player']) {
    if (down(who)) return { who, kind: 'down', text: `${name(who)} is shot down.` };
  }
  if (view.opponentYielded) return { who: 'opponent', kind: 'yield', text: `${name('opponent')} lets go of the gun and gives way.` };
  if (view.surrendered) return { who: 'player', kind: 'yield', text: `${name('player')} puts up both hands.` };
  const hurt = wounds('player').length + wounds('opponent').length > 0 || view.shots.some((e) => e.hit);
  if (hurt) return { who: null, kind: 'standoff', text: 'Blood is drawn, but both are still standing.' };
  if (view.shots.length) return { who: null, kind: 'standoff', text: 'Shots are traded and none finds its mark.' };
  return { who: null, kind: 'standoff', text: 'Nobody is hit. Both walk away.' };
}

const hashId = (s) => Math.floor(unit(`duel-view:${s}`) * 1e6);
const experienceOf = (rep) => (rep < 15 ? 'green' : rep < 45 ? 'seasoned' : 'veteran');

// Note: a side as the person painter wants it; the crew's own wear the sheriff's or a deputy's coat, everyone else a hostile look by reputation.
export function actorOf(side) {
  const role = side.role || 'hostile';
  return { role, id: hashId(side.name || role), name: side.name, look: 0, traits: { experience: experienceOf(side.reputation ?? 30) }, wounds: [], weapons: [], cur: 0, status: 'ok', ...(side.face ? { face: side.face } : {}) };
}

// Note: how one side ended, in a word; a death counts as in deadOf.
export function fateOf(view, who, report = null) {
  const wounds = (report && (who === 'player' ? report.wounds : report.opponentWounds)) || [];
  if (deadOf(view, who, report)) return 'dead';
  if (view[`${who}Status`] === 'incapacitated') return 'down';
  if (who === 'player' ? view.surrendered : view.opponentYielded) return 'gave way';
  return wounds.length || view.shots.some((e) => e.who !== who && e.hit) ? 'hurt' : 'unhurt';
}

const FATE_WORDS = { dead: 'dead', down: 'shot down', 'gave way': 'gave way', hurt: 'wounded', unhurt: 'unhurt' };
const WATCH_STAMP = { dead: 'A man down', down: 'A man down', both: 'Two men down', 'both-down': 'Two men down', yield: 'Gave way', standoff: 'Stand-off' };

// Note: the sheet that closes a duel, from the sim's view and report alone; the sheriff's own duel reads as won, lost or even, a watched one only says what happened.
export function resultOf(view, names, report = null, watch = false) {
  const out = outcomeOf(view, names, report);
  const tone = watch ? 'watch' : out.kind === 'both' || out.who === 'player' ? 'loss' : out.who === 'opponent' ? 'win' : 'even';
  const own = { win: 'Won', loss: out.kind === 'yield' ? 'Surrendered' : 'Lost', even: out.kind === 'both-down' ? 'Both down' : 'Stand-off' };
  const sides = ['player', 'opponent'].map((who) => {
    const shots = view.shots.filter((e) => e.who === who);
    return { who, name: names[who], fate: FATE_WORDS[fateOf(view, who, report)], shots: shots.length, hits: shots.filter((e) => e.hit).length };
  });
  return { tone, kind: out.kind, who: out.who, stamp: watch ? WATCH_STAMP[out.kind] : own[tone], headline: out.text, sides };
}

// Note: the line said when the campaign has taken a duel's result; it reads result.died and result.opponentDied, so a duel the fighter died in never reads as a win.
export function settledLine(names, report, result) {
  if (result.died && result.opponentDied) return 'Both men fall dead.';
  if (result.died) return `${names.player} is dead.`;
  if (result.opponentDied) return `${names.opponent} is dead.`;
  const downs = [report.playerStatus, report.opponentStatus].filter((x) => x === 'incapacitated').length;
  if (downs === 2) return 'Both men are shot down.';
  if (report.playerStatus === 'incapacitated') return `${names.player} is down.`;
  if (report.opponentStatus === 'incapacitated') return `${names.opponent} is down.`;
  if (report.surrendered) return `${names.player} gives way.`;
  return report.opponentYielded ? `${names.opponent} gives way.` : `${names.opponent} stops fighting.`;
}
