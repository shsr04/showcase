// Note: item 469: what the office's and the sheriff's standing currently does, in plain words, so the player can see the effects and infer the causes; no DOM or Phaser.

import { teamLimits, acceptRatio } from './crew.js';
import { maxTier, caseRangeKm } from './cases.js';
import { payFactor, talkBonus } from './progress.js';
import { availableContacts } from './intel.js';

const DANGER = ['', 'small affairs', 'rough affairs', 'hard cases', 'dangerous cases', 'very dangerous cases'];

export function standingEffects(state) {
  const limits = teamLimits(state.rep.team);
  const pay = Math.round((payFactor(state.rep.team) - 1) * 100);
  const accept = Math.round(acceptRatio(state) * 100);
  const contacts = availableContacts(state).length;
  return [
    { id: 'office', glyph: 'star', text: `The office can keep ${limits.office} on the payroll and send ${limits.encounter} in with the sheriff.` },
    { id: 'work', glyph: 'paper', text: `Word of ${DANGER[maxTier(state)]} reaches you, from as far as ${caseRangeKm(state)} km.` },
    { id: 'pay', glyph: 'coin', text: pay > 0 ? `Clients pay about ${pay}% more for a known office.` : 'Clients pay the ordinary rate.' },
    { id: 'hire', glyph: 'hand', text: accept < 100 ? `A hand will settle for about ${accept}% of the wage he asks.` : accept > 100 ? `A hand wants about ${accept}% of his asking wage to ride with you.` : 'A hand wants his asking wage.' },
    { id: 'talk', glyph: 'ear', text: talkBonus(state.rep.team) ? 'Townspeople open up and tell you more.' : 'Townspeople tell a stranger only so much.' },
    { id: 'contacts', glyph: 'eye', text: contacts ? `${contacts === 1 ? 'One contact' : `${contacts} contacts`} in town will report for the office.` : 'No one in town reports for the office yet.' },
  ];
}
