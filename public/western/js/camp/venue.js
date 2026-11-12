// Note: where a duel is held is a pure function of the campaign seed, the town and a salt, so the same duel is always held on the same ground.
import { unit } from '../rand.js';

export const MIN_DISTANCE = 6;
export const MAX_DISTANCE = 20;

// Note: ground is the floor the tile painter should use; props are what stands around the edge; the crowd is how many onlookers fit the place.
export const VENUES = {
  street: { label: 'the street outside', ground: 'dirt', props: ['rail', 'trough', 'wagon', 'barrels'], crowd: 5, reach: [8, 20] },
  yard: { label: 'a yard behind the saloon', ground: 'dirt', props: ['fence', 'barrels', 'crates', 'woodpile'], crowd: 3, reach: [6, 14] },
  corral: { label: 'the corral beside the livery', ground: 'dirt', props: ['fence', 'hay', 'trough'], crowd: 3, reach: [7, 16] },
  lot: { label: 'the open lot beside the saloon', ground: 'grass', props: ['brush', 'rocks', 'cart'], crowd: 4, reach: [9, 20] },
};

export const KINDS = Object.keys(VENUES);

// Note: the answer depends only on its arguments; nothing here reads or moves the dice stream.
export function venueFor(seed, town, salt = '') {
  const tag = `${seed}:venue:${town}:${salt}`;
  const kind = KINDS[Math.floor(unit(`${tag}:kind`) * KINDS.length)];
  const venue = VENUES[kind];
  const [lo, hi] = venue.reach;
  const distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, lo + Math.floor(unit(`${tag}:distance`) * (hi - lo + 1))));
  // Note: the facing decides which way the crowd stands and the sun comes from, so the picture is the same on every replay.
  const side = unit(`${tag}:side`) < 0.5 ? -1 : 1;
  const crowd = Math.max(0, Math.round(venue.crowd * (0.5 + unit(`${tag}:crowd`))));
  return { kind, label: venue.label, ground: venue.ground, props: venue.props.slice(), distance, side, crowd, seed: Math.floor(unit(`${tag}:look`) * 0x7fffffff) };
}
