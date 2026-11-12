// Note: the sheet of a Quick Duel: a sheriff and a stranger on a seeded ground, with no campaign, no save and no consequences.
import { randomPerson } from './crew.js';
import { venueFor } from './venue.js';
import { PERSONALITIES } from './gunslingers.js';
import { WEAPONS } from '../weapons.js';
import { unit, seedFromString } from '../rand.js';
import { makeLook, faceCode } from './looks.js';

const STANCES = ['neutral', 'wary', 'confident'];
const WEAPON = { id: 'colt73', ammoType: '45colt' };
const SPARE = 12;

// Note: a pure function of the seed; the same seed gives the same ground, the same stranger and the same exchange.
export function quickDuel(seed) {
  const tag = `${seed}:quick`;
  const pick = (list, salt) => list[Math.floor(unit(`${tag}:${salt}`) * list.length)];
  const site = venueFor(seed, 'quick', 'duel');
  // Note: randomPerson takes two draws; each name gets its own stream of the seed.
  const names = [0, 1].map((i) => {
    let n = 0;
    return randomPerson({ next: () => unit(`${tag}:name:${i}:${n++}`) }, { use: 'target' }).name;
  });
  const rep = 5 + Math.floor(unit(`${tag}:rep`) * 60);
  // Note: item 311: the two strangers have portraits like everyone named, seeded by the duel's seed.
  const portrait = (name, kind) => {
    const look = makeLook(seed, name, kind);
    return { look, marks: [], face: faceCode(look) };
  };
  const cap = WEAPONS[WEAPON.id].cap;
  return {
    phase: 'exchange',
    quick: true,
    watch: false,
    town: 'quick',
    charId: 'quick-sheriff',
    name: names[0],
    portrait: portrait(names[0], 'sheriff'),
    opponent: { id: 'quick-stranger', name: names[1], reputation: rep, portrait: portrait(names[1], 'gunslinger') },
    dispute: 'notoriety',
    threatened: true,
    witnesses: true,
    venue: site.label,
    distance: site.distance,
    site,
    weapon: { owner: 'quick-sheriff', weapon: { ...WEAPON } },
    initial: {
      loaded: cap,
      reserve: SPARE,
      seed: seedFromString(`${tag}:exchange`) & 0x7fffffff,
      player: {
        hand: 'right', skill: { aim: 0.5, nerve: 0.5, handling: 0.5 }, fatigue: 0, injuries: [], intoxication: 0, personality: 'proud', stance: 'neutral',
      },
      opponent: {
        personality: pick(PERSONALITIES, 'temper'), stance: pick(STANCES, 'stance'), reputation: rep, injuries: [], weapon: { ...WEAPON }, loaded: cap, reserve: SPARE,
      },
    },
  };
}
