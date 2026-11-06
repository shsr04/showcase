// Note: story data: objectives, voices with timed replies, ambient lines, act cards and causes of death.

import { seedFromString, rng } from './rand.js';

const HUNTER_FIRST = ['Amos', 'Cade', 'Boyd', 'Lyle', 'Dale', 'Silas', 'Wade', 'Eli'];
const HUNTER_LAST = ['Theriot', 'Guidry', 'Fontenot', 'LeBlanc', 'Broussard', 'Hebert', 'Landry', 'Thibodeaux'];

export function hunterName(seed) {
  const r = rng(seedFromString(`${seed}:hunter`));
  return { first: r.pick(HUNTER_FIRST), last: r.pick(HUNTER_LAST) };
}

export const BROKER = 'Delacroix';

export const OBJECTIVES = {
  motel: ['Room 4.'],
  car: ['The car.'],
  west: ['West on 90.', 'Sabine bridge.'],
  checkpoint: ['St. Jude checkpoint.', 'Sabine bridge.'],
  cross: ['Cross the Sabine.'],
  stranded: ['Car\'s dead.', 'Tow, or another car.'],
};

export const DEATHS = {
  shot: 'Shot',
  thirst: 'Thirst',
  crash: 'Crash',
  beaten: 'Beaten',
  wounds: 'Bled out',
  burned: 'Burned',
};

// Note: ambient lines are heard in every act, so they name no place.
export const AMBIENT = {
  coop: [
    'Truck used to come Tuesdays.',
    'Kids get the first cup.',
    'Y\'all ain\'t from here.',
    'Line forms at six.',
  ],
  company: [
    'They pay in chits.',
    'Plant\'s on half a crew.',
    'Stay off the yard road.',
  ],
  brigade: [
    'Pay what they ask.',
    'Supper\'s after the rosary.',
    'Gate shuts at dark.',
  ],
  none: [
    'Hm.',
    'Nothing here, mister.',
    'Road\'s worse out west.',
    'Keep your doors locked.',
  ],
  drifters: [
    'What.',
    'Keep walking.',
  ],
};

export const ALERTS = ['Hey!', 'Who\'s that?', 'Hey, you!', 'Over here!', 'Thief!'];
export const SPOT = ['...', 'Hm?', 'Somebody out there?'];

// Note: a voice is {who, text, replies:[{label, need, fx}], timeout, fxTimeout}; fx is applied by the game.
export function clerkVoice() {
  return {
    who: 'Clerk',
    text: 'I was in the back. I didn\'t see nothing.',
    replies: [
      { label: 'Who shot him?', fx: { say: 'White Tahoe. Two of \'em, company shirts.', flag: 'clueCompany' } },
      { label: 'Got any water?', fx: { say: 'Under the counter. Go on.', jug: 2 } },
      { label: 'You never saw me.', fx: { say: 'Okay. Okay.', heat: -5 } },
    ],
    fxTimeout: { say: 'Just go. Please.' },
  };
}

export function preacherVoice(S) {
  return {
    who: 'Preacher',
    text: 'Cots in the back. Pump\'s broke.',
    replies: [
      S.flags.churchWater || (S.standing.coop ?? 0) < 0
        ? { label: 'Got any water?', fx: { say: 'None left. I\'m sorry.' } }
        : { label: 'Got any water?', fx: { say: 'Two by the door. Take \'em.', jug: 2, flag: 'churchWater' } },
      { label: 'What\'s the Co-op paying?', fx: { say: 'Nothing. Out west they haul it in stock tanks.', flag: 'coopPlea', standing: { coop: 5 } } },
      { label: 'Bless the road.', fx: { say: 'Bow your head a minute.' } },
    ],
    fxTimeout: { say: 'All right.' },
  };
}

export function familyVoice() {
  return {
    who: 'Mother',
    text: 'Please. Y\'all got any water.',
    replies: [
      { label: 'Two jugs. Take \'em.', need: { water: 2 }, fx: { say: 'Lord. Thank you.', water: -2, standing: { coop: 10 }, flag: 'gaveFamily' } },
      { label: 'One jug.', need: { water: 1 }, fx: { say: 'Thank you.', water: -1, standing: { coop: 4 }, flag: 'gaveFamily' } },
      { label: 'Can\'t help you.', fx: { say: 'Okay.', standing: { coop: -2 } } },
    ],
    fxTimeout: { say: 'Okay.', standing: { coop: -2 } },
  };
}

export function tollVoice() {
  return {
    who: 'Toll man',
    hostile: true,
    text: 'Two jugs. Set \'em on the hood.',
    replies: [
      { label: 'Two jugs. Here.', need: { water: 2 }, fx: { say: 'Go on.', water: -2, pass: true } },
      { label: 'Eight rounds instead.', need: { ammo: 8 }, fx: { say: 'Yeah, all right.', ammo: -8, pass: true } },
      { label: 'Move the bikes.', fx: { test: 'drifters', say: 'Boys.' } },
    ],
    fxTimeout: { say: 'Boys.', fight: true },
  };
}

export function checkpointVoice(S, copCar) {
  const lie = copCar ? 'Bought it at auction.' : 'Just passing through.';
  return {
    who: 'Saint',
    hostile: true,
    text: copCar ? 'Step out of the car. Slow.' : 'Bridge is three water.',
    replies: [
      { label: 'Three water. Here.', need: { water: 3 }, fx: { say: 'Go on through.', water: -3, pass: true, standing: { brigade: 3 } } },
      { label: 'Twelve rounds instead.', need: { ammo: 12 }, fx: { say: 'All right.', ammo: -12, pass: true } },
      { label: lie, fx: { test: 'lie', say: copCar ? 'Out the car. Now.' : 'Go on, then.' } },
    ],
    fxTimeout: { say: 'Search it.', fight: true },
  };
}

export function companyVoice() {
  return {
    who: 'Permian man',
    text: 'Permian W&L. Pull it over a second.',
    replies: [
      { label: 'I\'m listening.', fx: { say: 'Offer\'s on our band. Hear it out before you do anything.', flag: 'companyMet', standing: { company: 6 }, pass: true } },
      { label: 'No.', fx: { say: 'Get the tires.', fight: true } },
      { label: `Who shot ${BROKER}?`, fx: { say: 'Wasn\'t us. Saints truck in Crowley that night, is all I know.', flag: 'companyMet', pass: true } },
    ],
    fxTimeout: { say: 'Get the tires.', fight: true },
  };
}

export const TRACE_NOTE = 'Still warm. Co-op papers in the glovebox. St. Jude medal on the mirror.';
export const RESIDENTS_CALL = 'Jacob\'s Well, south off 290, this side of the Pedernales. You with 7-C: we got 7-D. Gun stays in the truck.';
export const hunterDeadLine = (hunter) => `Brother ${hunter.first} ${hunter.last}, killed on the road. Rosary Thursday, Vinton.`;
export const TRACE_NOTE_2 = 'Co-op water truck. Tank shot through, dry. St. Jude medal on the mirror.';

// Note: what a mechanic says the first time once the tracker has been through; it changes if you are not in the cop car.
export function mechanicHunterLine(copCar) {
  return copCar
    ? 'Fella was in here asking about a black-and-white Crown Vic.'
    : 'Fella come through asking after a cop car. Paid in rounds.';
}

// Note: objectives after Act 1, by act and beat.
export const ACT_OBJECTIVES = {
  2: {
    west: ['West on 190.', 'Brazos River.'],
    gate: ['Weigh station.', 'Permian W&L.'],
  },
  3: {
    west: ['West on 290.', 'Pecos River.'],
    ranch: ['Jacob\'s Well.', 'South off 290.'],
  },
  4: {
    west: ['North-west on 385.', 'State line.'],
  },
  5: {
    west: ['West on 62.', 'The Exchange.'],
    end: ['Survey 7-C.', 'The Exchange, or the KBON tower.'],
  },
};

// Note: the card between two acts names the next act and nothing else.
export function actCard(from) {
  if (from === 1) return { kicker: 'II', title: 'Piney Woods' };
  if (from === 2) return { kicker: 'III', title: 'Hill Country' };
  if (from === 3) return { kicker: 'IV', title: 'Permian Basin' };
  return { kicker: 'V', title: 'New Mexico' };
}

export const ACT_ARRIVAL = {
  2: 'Texas.',
  3: 'Bastrop County.',
  4: 'Pecos County.',
  5: 'Lea County.',
};

// Note: Act 2: the Co-op town at the dry tower.
export function woodvilleVoice() {
  return {
    who: 'Co-op elder',
    text: 'Tower went dry in June. Line\'s a cup a head, what there is.',
    replies: [
      { label: 'Four jugs, for the line.', need: { water: 4 }, fx: { say: 'Bless you. On the table there.', water: -4, standing: { coop: 12 }, flag: 'gaveTown' } },
      { label: 'What\'s the Co-op offering?', fx: { say: 'Can\'t outbid oil money. We got a radio and four trucks.', flag: 'bidCoop', standing: { coop: 3 } } },
      { label: 'Can\'t stop.', fx: { say: 'Mm-hm.', standing: { coop: -1 } } },
    ],
    fxTimeout: { say: 'Mm-hm.' },
  };
}

// Note: Act 4: the last Co-op town before the line.
export function seminoleVoice() {
  return {
    who: 'Co-op elder',
    text: 'Tank\'s down to eleven days.',
    replies: [
      { label: 'Four jugs. Take \'em.', need: { water: 4 }, fx: { say: 'Appreciate you.', water: -4, standing: { coop: 10 }, flag: 'gaveSeminole' } },
      { label: 'The Co-op gets the map.', fx: { say: 'Third table at the Exchange. Ask for Rosa.', flag: 'promiseCoop', standing: { coop: 5 } } },
      { label: 'Can\'t promise you anything.', fx: { say: 'All right.' } },
    ],
    fxTimeout: { say: 'Drive safe.' },
  };
}

export function coopAmbushVoice() {
  return {
    who: 'Co-op man',
    hostile: true,
    text: 'Mister, we need two jugs. That\'s all.',
    replies: [
      { label: 'Two jugs. Let me by.', need: { water: 2 }, fx: { say: 'Go on. Go.', water: -2, pass: true, standing: { coop: 2 } } },
      { label: 'I\'m hauling for the Co-op.', fx: { test: 'coop', okSay: 'Pull the belt, Dale.', say: 'No, you ain\'t.' } },
      { label: 'Get out of the road.', fx: { say: 'Get the truck.', fight: true } },
    ],
    fxTimeout: { say: 'Get the truck.', fight: true },
  };
}

export function weighVoice(S, copCar) {
  return {
    who: 'Permian man',
    hostile: true,
    text: copCar ? 'Driver, step out of the vehicle.' : 'Inspection fee\'s three water. Pop the trunk.',
    replies: [
      { label: 'Three water. Trunk\'s open.', need: { water: 3 }, fx: { say: 'Inspection complete.', water: -3, pass: true, standing: { company: 2 } } },
      { label: 'Twenty rounds instead.', need: { ammo: 20 }, fx: { say: 'Go ahead.', ammo: -20, pass: true } },
      S.flags.companyMet
        ? { label: 'Your man on 90 cleared me.', fx: { say: 'Yeah, they radioed. Go ahead.', pass: true, standing: { company: 3 } } }
        : { label: 'I\'m not stopping.', fx: { say: 'Throw the strip!', fight: true } },
    ],
    fxTimeout: { say: 'Throw the strip!', fight: true },
  };
}

export function companyVoice2(act) {
  return {
    who: 'Permian man',
    text: act >= 4 ? 'Pull up a minute. We\'ll ride with you to the Exchange.' : 'Pull over. Just want to talk.',
    replies: [
      { label: 'Go ahead.', fx: { say: 'First table at the Exchange. Ask for us.', flag: 'companyMet', standing: { company: 5 }, pass: true } },
      { label: 'No thanks.', fx: { say: 'Get the tires.', fight: true } },
      { label: 'What\'s it worth to you?', fx: { say: 'Forty jugs a month, delivered.', flag: 'bidCompany', pass: true } },
    ],
    fxTimeout: { say: 'Get the tires.', fight: true },
  };
}

// Note: the hunter is from Acadiana; he keeps that voice all the way west.
export function hunterCallVoice(hunter, copCar) {
  const hn = `${hunter.first} ${hunter.last}`;
  return {
    who: 'CB 19',
    text: copCar ? `Westbound Crown Vic, you got your ears on? This is ${hn}.` : `Courier, you got your ears on? This is ${hn}.`,
    replies: [
      { label: 'Who\'s paying you?', fx: { say: 'The Saints. They pay in water, cher.', flag: 'hunterContact' } },
      { label: 'What do you want?', fx: { say: 'Set the case by the scale at the Brazos. Then you keep going.', flag: 'hunterContact' } },
      { label: 'Go home.', fx: { say: 'Mais, okay.', heat: 4, flag: 'hunterContact' } },
    ],
    fxTimeout: { say: 'You there? ...Okay.', heat: 4 },
  };
}

// Note: Act 3: the hunter finally gets ahead of the courier, at a crossing that cannot be avoided.
export function standoffVoice(hunter) {
  const hn = `${hunter.first} ${hunter.last}`;
  return {
    who: hn,
    hostile: true,
    text: 'Just the case, cher. You keep driving.',
    replies: [
      { label: 'Six water and you lose my trail.', need: { water: 6 }, fx: { say: 'In the back seat there.', water: -6, hunter: 'bought', pass: true } },
      { label: 'I\'m the decoy. Case went north.', fx: { test: 'mislead', okSay: 'Hm. Okay, go.', say: 'No.' } },
      { label: 'Come and get it.', fx: { say: 'All right, then.', fight: true } },
    ],
    fxTimeout: { say: 'Go on.', pass: true },
  };
}


// Note: Act 5: the hunter's last stand on the mesa road, on foot, with nothing left to chase.
export function bossVoice(hunter) {
  return {
    who: `${hunter.first} ${hunter.last}`,
    hostile: true,
    text: 'Turn the engine off, cher.',
    replies: [
      { label: 'Twelve water. Then it\'s done.', need: { water: 12 }, fx: { say: 'Okay. Set it down.', water: -12, hunter: 'bought', pass: true } },
      { label: 'Permian has it. Took it at the Brazos.', fx: { test: 'mislead', hard: true, okSay: '...Mais. Go on, then.', say: 'No.' } },
      { label: 'Not today.', fx: { say: 'All right.', fight: true } },
    ],
    fxTimeout: { say: 'All right.', fight: true },
  };
}
// Note: Act 4: the chase stops when the courier does.
export function chaseStopVoice(hunter) {
  return {
    who: `${hunter.first} ${hunter.last}`,
    hostile: true,
    text: 'Out the car. Slow.',
    replies: [
      { label: 'Ten water. It\'s in the trunk.', need: { water: 10 }, fx: { say: 'Put it on the ground there.', water: -10, hunter: 'bought', pass: true } },
      { label: 'Permian took it. Odessa yard.', fx: { test: 'mislead', hard: true, okSay: 'Son of a bitch. Go.', say: 'No, no.' } },
      { label: 'You\'ll have to take it.', fx: { say: 'Okay.', fight: true } },
    ],
    fxTimeout: { say: 'Okay.', fight: true },
  };
}

export function residentsVoice(S) {
  const trusted = !!(S.flags.gaveTown || S.flags.gaveFamily || (S.standing.coop ?? 0) >= 10 || (S.standing.residents ?? 0) >= 10);
  return {
    who: 'Resident',
    text: 'Coffee\'s on. That 7-C ain\'t but half of it.',
    replies: [
      { label: 'Then it stays here. Both halves.', fx: { say: 'Pull your car round back.', end: 'residents' } },
      trusted
        ? { label: 'You have my word. Let me carry both.', fx: { say: 'Heard about you. Here, take it.', give: 'half', flag: 'promiseResidents', standing: { residents: 10 } } }
        : { label: 'You have my word. Let me carry both.', fx: { say: 'I don\'t know you.', standing: { residents: -2 } } },
      { label: 'Twenty rounds for your half.', need: { ammo: 20 }, fx: { say: 'Fence line\'s been needing it.', ammo: -20, give: 'half', standing: { residents: 3 } } },
    ],
    fxTimeout: { say: 'Think on it.' },
  };
}

export function docVoice(S) {
  return {
    who: 'Doc',
    text: 'Mind the glass there.',
    replies: [
      { label: 'Where\'s the tower?', fx: { say: 'Ridge up the road. Transmitter\'s in the shack, door sticks.', flag: 'docTower' } },
      S.flags.docWater
        ? { label: 'Got any water?', fx: { say: 'That was the last of it.' } }
        : { label: 'Got any water?', fx: { say: 'Two in the cooler. Take \'em.', jug: 2, flag: 'docWater' } },
      { label: 'What\'s the Exchange?', fx: { say: 'Permian, the Saints, the Co-op lady. They frisk you at the door.' } },
    ],
    fxTimeout: { say: 'Suit yourself.' },
  };
}

export function transmitterVoice() {
  return {
    who: 'KBON 101.1',
    text: '',
    replies: [
      { label: 'Anybody listening. Survey 7-C reads...', fx: { end: 'broadcast' } },
      { label: 'Not yet.', fx: {} },
    ],
    fxTimeout: {},
  };
}

export function buyerVoice(S, faction, hunter) {
  if (faction === 'company') {
    return {
      who: 'Permian man',
      text: 'Forty jugs a month, delivered. Sign here, and here.',
      replies: [
        { label: 'Give me the pen.', fx: { end: 'company' } },
        { label: 'What about the towns?', fx: { say: 'Meters, same as anybody.' } },
        { label: 'Not yet.', fx: { say: 'Sure.' } },
      ],
      fxTimeout: { say: 'Sure.' },
    };
  }
  if (faction === 'brigade') {
    if (S.flags.brigadeWar) {
      return {
        who: 'Saint',
        hostile: true,
        text: 'You don\'t sit here.',
        replies: [{ label: 'I\'m going.', fx: { say: 'Brothers.', fight: true } }],
        fxTimeout: { say: 'Brothers.', fight: true },
      };
    }
    const hn = `${hunter.first} ${hunter.last}`;
    return {
      who: 'Saint',
      text: 'Amnesty. Room and board at Vinton, long as you want.',
      replies: [
        { label: 'Deal.', fx: { end: 'brigade' } },
        { label: 'Where\'s your tracker?', fx: { say: S.hunter === 'bought' ? `Brother ${hunter.last} went home. Ville Platte, I think.` : S.hunter === 'misled' ? `Brother ${hunter.last} is in Midland.` : `${hn}? He's around.` } },
        { label: 'Not yet.', fx: { say: 'All right.' } },
      ],
      fxTimeout: { say: 'All right.' },
    };
  }
  return {
    who: 'Co-op woman',
    text: 'Nothing to pay you with, hon. Towns\'d drink first, is all.',
    replies: [
      { label: 'It\'s yours.', fx: { end: 'coop' } },
      { label: 'Why you?', fx: { say: S.flags.gaveSeminole || S.flags.gaveTown ? 'You\'ve seen the lines.' : 'You been to Seminole?' } },
      { label: 'Not yet.', fx: { say: 'Okay, hon.' } },
    ],
    fxTimeout: { say: 'Okay, hon.' },
  };
}
