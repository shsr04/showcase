// Note: the one table of trouble rates for saloon and rest; tests force events through state.rates, never by hunting for seeds.

// Note: the crew size the teammate rates are tuned for; a larger crew shares the same total chance.
export const TUNED_MATES = 2;

export const RATES = Object.freeze({
  // Note: per saloon activity (drink, meal, talk, game): a gunslinger challenges the sheriff, else a fight may start, else two others may take a dispute outside.
  challenge: 0.015,
  fight: 0.035,
  spectate: 0.012,
  // Note: per fit teammate per rest hour a visit to the saloon; each visit may end in a fight or a challenge.
  teammateVisit: 0.18,
  teammateFight: 0.02,
  teammateChallenge: 0.016,
  // Note: a gunslinger of this town who has met the crew before may come back; this is the chance that one present is picked.
  gunslingerReturn: 0.5,
  // Note: per day, chance a gunslinger moves on to a neighbouring place.
  gunslingerMove: 0.08,
});

// Note: the outcomes a test may force through state.rates, one per key; null leaves the outcome to the dice.
const HOOKS = Object.freeze({
  // Note: true or false forces a persuasion roll.
  persuade: null,
  // Note: 'sheriff' or 'patron' says whom a saloon fight is about.
  fightTarget: null,
  // Note: true or false says whether the troublemakers of a saloon fight carry revolvers.
  armed: null,
  // Note: an object of brawl-sim.js tuning numbers; a fight keeps it in its saved record.
  brawl: null,
  // Note: 0 makes the hourly road roll quiet; 'choice' or 'hostile' makes every roll an encounter of that kind.
  road: null,
  // Note: the chance of a lead about the nemesis from a case, a talk or the road (story.js); 0 finds none, 1 one every time.
  lead: null,
  // Note: true or false forces whether the sheriff's eye leads the party around a road ambush (item 467).
  avoid: null,
  // Note: true or false forces whether an access reward turns up when its conditions are met (item 471).
  reward: null,
});

// Note: the table with the numbers a test keeps in state.rates; a saved game never carries state.rates.
export const ratesOf = (state) => (state && state.rates ? { ...RATES, ...state.rates } : RATES);

export const hooksOf = (state) => Object.fromEntries(Object.entries(HOOKS).map(([key, none]) => [key, state?.rates?.[key] ?? none]));
