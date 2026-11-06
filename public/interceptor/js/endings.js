// Note: the six endings and their epilogue; one bare line each for the water, the factions, the hunter and the courier.

import { actOf } from './acts.js';

export const ENDING_IDS = ['company', 'brigade', 'coop', 'residents', 'broadcast', 'dead'];

const HEAD = {
  company: { kicker: 'SOLD', title: 'Permian W&L', copy: 'First table.' },
  brigade: { kicker: 'SOLD', title: 'St. Jude Brigade', copy: 'Second table.' },
  coop: { kicker: 'GIVEN', title: 'Llano Co-op', copy: 'Third table.' },
  residents: { kicker: 'GIVEN BACK', title: 'Jacob\'s Well', copy: 'Coffee can, top shelf.' },
  broadcast: { kicker: 'BROADCAST', title: 'KBON 101.1', copy: 'Read three times.' },
};

// Note: S is the final run state, hunter is {first, last}; returns {kicker, title, copy, lines}.
export function ending(S, id, hunter) {
  const head = HEAD[id] || { kicker: 'DEAD', title: '', copy: '' };
  return { ...head, lines: epilogue(S, id, hunter) };
}

export function epilogue(S, id, hunter) {
  const f = S.flags;
  const st = S.standing;
  const full = !!f.surveyFull;
  const name = S.name || 'The courier';
  const hn = `${hunter.first} ${hunter.last}`;
  const state = S.hunter || 'hunting';
  const lines = [];

  // Note: the water first, because that is what everyone was fighting over.
  const water = {
    company: full
      ? 'Permian rigs on the Edwards by April, both halves taped to the trailer wall.'
      : 'Permian rigs on the Edwards by April, working off half a survey. Jacob\'s Well stops running the second summer.',
    brigade: full
      ? 'Brigade wells on the Edwards, a Saint at every pump.'
      : 'Brigade wells off half a survey. The first three come up brackish.',
    coop: full
      ? 'Borrowed rigs, one at a time. The first tanker reaches Seminole the next August.'
      : 'Co-op wells off half a survey. Two dry holes, then one at four hundred feet.',
    residents: 'Nobody drills. The spring at Jacob\'s Well runs all summer.',
    broadcast: full
      ? 'By morning, coordinates on feed sacks and dashboards from Odessa to the Gulf.'
      : 'Rigs from three states on 290 within the week. The springs run muddy by fall.',
    dead: !f.hasSurvey
      ? 'Survey 7-C, still in Room 4.'
      : state === 'hunting'
        ? `${hn} takes the case off the seat.`
        : 'The case in the footwell, all summer.',
  };
  lines.push(water[id] || water.dead);

  if (id !== 'coop') {
    if (f.gaveTown) lines.push('In Woodville, an empty jug on the shelf at the tower.');
    else if (f.gaveFamily) lines.push('The boy outside Crowley turns five in March.');
    else if ((st.coop ?? 0) <= -10) lines.push('The Llano relay stops calling for the courier.');
    if (id === 'company') lines.push('Meters on every tap from San Antonio to Odessa.');
    if (id === 'brigade') lines.push('Seminole loads its trucks for Lubbock.');
  } else if (f.gaveTown || f.gaveFamily) {
    lines.push('A black-and-white car painted on the first tanker\'s door.');
  }

  if (id !== 'company' && f.fought_company) lines.push('In Odessa, a plate number on file.');

  if (f.brigadeWar) lines.push('On the bridge at Vinton, the car in spray paint, a red X through it.');
  else if (id === 'brigade') lines.push('Amnesty papers, signed and stamped.');
  else if (f.checkpointFight) lines.push('Skid marks on the Sabine bridge, still there in spring.');

  if (f.residentsMet) {
    if (id === 'residents') lines.push('The gate at Jacob\'s Well, left unlatched.');
    else if (f.stoleHalf) lines.push('At Jacob\'s Well they change the locks.');
    else if (f.promiseResidents && (id === 'company' || id === 'brigade')) lines.push('New fence at Jacob\'s Well, eight foot, wire on top.');
    else if (f.promiseResidents) lines.push('Co-op trucks through the gate at Jacob\'s Well, Tuesdays.');
  }

  if (state === 'dead') lines.push(`${hn} is buried by the road.`);
  else if (state === 'bought') lines.push(`${hn} goes home to Ville Platte.`);
  else if (state === 'misled') lines.push(`${hn} follows a Permian convoy as far as Midland.`);
  else if (id !== 'dead' && f.hunterHired) lines.push('Some nights, a black Tahoe at the end of the road, lights off.');

  const fate = {
    company: `Forty jugs a month to General Delivery, Hobbs, for ${name}.`,
    brigade: `${name} keeps a room at Vinton.`,
    coop: `${name} rides the first tanker into Seminole.`,
    residents: `${name} stays on at the well. The car up on blocks under the cedars.`,
    broadcast: `${name} in the shack until the batteries go.`,
    dead: `Mile ${Math.round(S.stats?.miles ?? 0)}, US ${actOf(S.act).road}.`,
  };
  lines.push(fate[id] || fate.dead);
  if ((S.stats?.kills ?? 0) >= 8) lines.push(`${S.stats.kills} dead between Crowley and here.`);
  return lines;
}
