// Note: gunslingers outlive their duels; each has a place, a reputation and a few memories that are read the next time he meets the crew.
import { PLACES, neighbours } from './world.js';
import { clamp, dice } from './base.js';
import { isFit, randomPerson, simInjuries } from './crew.js';
import { capability, oldWound } from '../wounds.js';
import { unit } from '../rand.js';
import { ratesOf } from './rates.js';
import { loadoutFor, slotOf } from './arsenal.js';

export const LIVE_CAP = 12;
export const MEMORY_CAP = 4;
export const PERSONALITIES = ['proud', 'volatile', 'cautious'];
const DAY = 1440;
// Note: a long absence is judged over the last two months only; older days cannot change where he is now.
const MOVE_DAYS = 60;
const REARM_DAYS = 7;

export const canHandle = (person) => capability({ status: 'ok', hand: person.hand, wounds: simInjuries(person).map(oldWound) }).handgunOk;

// Note: what each kind of memory does to a gunslinger: the opening stance, the weight on his bond with the crew, and the change in his own reputation.
export const MEMORY = {
  humiliated: { stance: 'grudge', bond: -0.5, rep: -8 },
  spared: { stance: 'friendly', bond: 0.4, rep: -3 },
  bested: { stance: 'confident', bond: -0.1, rep: 8 },
  standoff: { stance: 'wary', bond: 0.1, rep: 1 },
  persuaded: { stance: 'wary', bond: 0.15, rep: 0 },
  watched: { stance: 'wary', bond: 0, rep: 0 },
  dead: { stance: 'neutral', bond: 0, rep: 0 },
};

const LINES = {
  neutral: { proud: 'Nobody talks to me like that.', volatile: 'You looking at me?', cautious: 'I want no trouble, but I will not be pushed.' },
  grudge: { proud: 'You made a fool of me in front of everybody. I have not forgotten.', volatile: 'You! I have been waiting for you.', cautious: 'I told myself I would not let it go. Now you are here.' },
  friendly: { proud: 'You let me walk away. I remember that. Must we do this?', volatile: 'Hell, it is you. I owe you. Walk away and we are even.', cautious: 'You spared me once. I would rather not do this.' },
  confident: { proud: 'Last time I put you down. Shall we go again?', volatile: 'Back for more? Fine by me.', cautious: 'I know how this ends. Do you?' },
  wary: { proud: 'We have met. I know how you shoot.', volatile: 'Not you again.', cautious: 'I remember you. Careful now.' },
};

// Note: a gunslinger that lacks a weapon, ammunition, wounds, memories, a place or a last-seen time (repairMen drops bad ones on load) gets them on first touch.
export function ensure(state) {
  state.gunslingers ||= [];
  for (const g of state.gunslingers) {
    if (g.weapon === undefined) g.weapon = { id: 'colt73', ammoType: '45colt' };
    if (g.ammunition === undefined) g.ammunition = 24;
    g.injuries ||= [];
    g.memories ||= [];
    g.at ??= state.at;
    g.seen ??= state.min;
    g.moved ??= state.min;
  }
  return state.gunslingers;
}

export const inUse = (state) => new Set([state.duel?.opponentId, state.spectacle?.a?.id, state.spectacle?.b?.id].filter(Boolean));

// Note: a move is a stable hash of the seed, the man and the day, so it never touches the dice stream and gives the same answer however often it is asked.
export function roam(state) {
  const busy = inUse(state);
  const rate = ratesOf(state).gunslingerMove;
  const today = Math.floor(state.min / DAY);
  for (const g of ensure(state)) {
    if (!g.alive || busy.has(g.id)) continue;
    const from = Math.max(Math.floor(g.moved / DAY) + 1, today - MOVE_DAYS + 1);
    for (let day = from; day <= today; day++) {
      if (unit(`${state.seed}:gs-move:${g.id}:${day}`) >= rate) continue;
      const around = neighbours(g.at).sort();
      const inns = around.filter((id) => PLACES[id]?.services.saloon);
      const options = inns.length ? inns : around;
      if (options.length) g.at = options[Math.floor(unit(`${state.seed}:gs-to:${g.id}:${day}`) * options.length)];
    }
    g.moved = state.min;
  }
}

export const able = (g) => g.alive && !!g.weapon && g.ammunition > 0 && isFit({ ...g, injuries: g.injuries || [] }) && canHandle(g);

// Note: the survivors drinking in the saloon of this town right now.
export function present(state, town = state.at) {
  roam(state);
  if (!PLACES[town]?.services.saloon) return [];
  return state.gunslingers.filter((g) => g.alive && g.at === town);
}

// Note: a man who needed a gun and has had a week in a town with a store is armed again.
export function rearm(state) {
  for (const g of ensure(state)) {
    if (g.alive && g.rearmAt != null && state.min >= g.rearmAt && PLACES[g.at]?.services.store) {
      g.weapon ||= { id: 'colt73', ammoType: '45colt' };
      g.ammunition = Math.max(g.ammunition || 0, 6);
      g.rearmAt = null;
    }
  }
}

// Note: the order men leave a full roster: men with no memories of the crew first, then the one seen longest ago.
export const leavesFirst = (a, b) => Number(!!a.memories?.length) - Number(!!b.memories?.length) || (a.seen ?? 0) - (b.seen ?? 0) || a.id.localeCompare(b.id);

// Note: dead men are dropped first; a full roster loses a live man by leavesFirst.
function makeRoom(state) {
  const busy = inUse(state);
  state.gunslingers = ensure(state).filter((g) => g.alive || busy.has(g.id));
  while (state.gunslingers.filter((g) => g.alive).length >= LIVE_CAP) {
    const idle = state.gunslingers.filter((g) => g.alive && !busy.has(g.id)).sort(leavesFirst);
    if (!idle.length) break;
    state.gunslingers.splice(state.gunslingers.indexOf(idle[0]), 1);
  }
}

// Note: the dice are drawn in the order name, temper, reputation.
export function create(state, d = dice(state)) {
  makeRoom(state);
  const id = `g${state.nextGunslinger || 1}`;
  const g = {
    id, name: randomPerson(d, { use: 'target' }).name,
    personality: d.pick(PERSONALITIES), reputation: d.int(5, 65), alive: true, injuries: [], memories: [],
    // Note: item 365: a gunslinger's revolver fits his trade and his region.
    weapon: loadoutFor('gunslinger', PLACES[state.at]?.region, `${state.seed}:${id}`).find((w) => slotOf(w) === 'handgun'), ammunition: 24,
    at: state.at, seen: state.min, moved: state.min,
  };
  state.nextGunslinger = (state.nextGunslinger || 1) + 1;
  state.gunslingers.push(g);
  return g;
}

// Note: for a challenge, a survivor of this town may come back, else a stranger rides in.
export function pick(state) {
  rearm(state);
  const busy = inUse(state);
  const survivors = present(state).filter((g) => able(g) && !busy.has(g.id));
  const d = dice(state);
  if (survivors.length && d.chance(ratesOf(state).gunslingerReturn)) return d.pick(survivors);
  return create(state);
}

export function byId(state, id) {
  return (state.gunslingers || []).find((g) => g.id === id) || null;
}

// Note: how he stands toward one of the crew: the stance of his latest memory, a bond that remembers every memory with less weight for the old ones, and a line to say.
export function reading(g, charId) {
  const memories = g.memories || [];
  const last = memories.length ? MEMORY[memories[memories.length - 1].kind] || MEMORY.dead : null;
  let bond = 0;
  memories.slice().reverse().forEach((m, i) => {
    const kind = MEMORY[m.kind] || MEMORY.dead;
    bond += kind.bond * (m.charId === charId ? 1 : 0.6) * 0.6 ** i;
  });
  const stance = last ? last.stance : 'neutral';
  const met = memories.some((m) => m.charId === charId);
  const line = LINES[stance]?.[g.personality] || LINES.neutral.proud;
  return { stance, bond: clamp(bond, -1, 1), met, line, history: memories.map((m) => m.kind) };
}

// Note: what happened in the exchange, from the gunslinger's side, in words that match the memory table.
export function kindOf(duel, report, { died, opponentDied }) {
  if (opponentDied) return 'dead';
  // Note: items 356, 358: the man standing at the first fall has won; two falling at once is a standoff.
  if (report.fellTogether) return 'standoff';
  if (report.winner === 'player') return 'humiliated';
  if (report.winner === 'opponent') return 'bested';
  if (died || report.playerStatus === 'incapacitated' || report.surrendered) return 'bested';
  if (report.opponentStatus === 'incapacitated') return 'humiliated';
  const ahead = (report.opponentWounds || []).length > 0 || report.opponentWeaponHeld === false || report.opponentYielded;
  return ahead ? 'spared' : 'standoff';
}

// Note: only the last few memories are kept; each notes who, why, when and the kind.
export function remember(state, g, entry) {
  g.memories ||= [];
  g.memories.push({ min: state.min, ...entry });
  while (g.memories.length > MEMORY_CAP) g.memories.shift();
  g.seen = state.min;
  g.moved = state.min;
  const kind = MEMORY[entry.kind] || MEMORY.dead;
  g.reputation = clamp((g.reputation ?? 20) + kind.rep, 0, 100);
}

// Note: a survivor without a gun or rounds is armed again a week later.
export function rearmLater(state, g) {
  if (!g.weapon || g.ammunition <= 0) g.rearmAt = state.min + REARM_DAYS * DAY;
}
