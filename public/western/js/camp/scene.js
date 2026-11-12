// Note: the bridge from a campaign encounter spec to a running Sim; the UI and the tests both build their scenes here.

import { Sim } from '../sim.js';
import { generateHouse } from '../house.js';
import { generateOutdoor } from '../outdoor.js';
import { loadoutFor, reserveFor } from './arsenal.js';
import { stateAt, setState } from '../map.js';
import { DS, WS } from '../tiles.js';
import { applyMemory, restoreScene, captureSite } from './site-memory.js';
import { SIDES } from '../outdoor-ring.js';

// Note: item 470: every ground entry barred, a broken window boarded up, except the door the report names (the front faces the yard, the back the far wall), which is left closed and usable without forcing (item 70).
export function barricade(site, way) {
  const map = site.map;
  const doors = site.entries.filter((e) => e.kind === 'door').sort((a, b) => a.y - b.y || a.x - b.x);
  const keep = way === 'back' ? doors[0] : doors[doors.length - 1];
  for (const e of site.entries) {
    if (e === keep) setState(map, 0, e.x, e.y, DS.CLOSED);
    else setState(map, 0, e.x, e.y, e.kind === 'door' ? DS.LOCKED : WS.BOLTED);
  }
  return site;
}

// Note: a house takes the difficulty as given; an outdoor site also takes its terrain from the spec.
// Note: item 488: a case site is laid out from its own seed (spec.site.seed) and kept changes, so a return finds the same ground; the scene's own seed only moves its people.
export function buildSite(spec) {
  const diff = spec.diff || undefined;
  const layoutSeed = spec.site?.seed ?? spec.seed;
  const memory = spec.site?.memory || null;
  if (spec.siteKind === 'outdoor') {
    const ring = diff?.layout === 'ring' ? { people: spec.seed, side: spec.side || spec.approach?.side || 's' } : {};
    return applyMemory(generateOutdoor(layoutSeed, { terrain: spec.terrain || undefined, ...(diff || {}), ...ring }), memory);
  }
  const site = generateHouse(layoutSeed, { ...diff, ...(spec.site?.layout || {}), allowSingleStory: true });
  return applyMemory(diff?.defenses?.includes('barred') ? barricade(site, diff.way) : site, memory);
}

// Note: item 486: the spec with the party's entry side, when the spec offers a choice and the side is one of the four.
export function withSide(spec, side) {
  if (!spec || !spec.approach || !spec.approach.choose || !SIDES.includes(side)) return spec;
  return { ...spec, side };
}

// Note: opts can carry a test rand; the party, the site and the ambush flag always come from the spec.
export function buildSim(spec, opts = {}) {
  const site = buildSite(spec);
  // Note: item 291: in an associate's case the first hostile is the associate, who can surrender or be restrained.
  if (spec.associate && site.hostiles.length) site.hostiles[0] = { ...site.hostiles[0], associate: spec.associate };
  // Note: item 492: in an ordinary case the first hostile is the wanted target; the rest are accomplices who never give up.
  else if (spec.target && site.hostiles.length) site.hostiles[0] = { ...site.hostiles[0], wanted: { name: spec.target.name } };
  // Note: item 470: a reported lieutenant is the second man, a veteran with a steady nerve.
  if (spec.diff?.lieutenant && site.hostiles.length > 1) site.hostiles[1] = { ...site.hostiles[1], experience: 'veteran', nerve: Math.max(0.8, site.hostiles[1].nerve) };
  // Note: item 365: in a campaign scene each man's guns follow his role and region; an associate is armed as one.
  if (spec.arms) {
    // Note: item 470: men known to be well armed carry long guns like an associate's.
    const rifles = !!spec.diff?.defenses?.includes('rifles');
    site.hostiles = site.hostiles.map((h, i) => {
      const tag = `${spec.arms.tag}:arms:${i}`;
      const loadout = loadoutFor(h.associate || rifles ? 'associate' : spec.arms.role, spec.arms.region, tag);
      return { ...h, loadout, reserve: reserveFor(loadout, tag) };
    });
  }
  return restoreScene(new Sim(spec.seed, { dynamite: spec.dynamite || 0, ...opts, site, party: spec.party, ambush: !!spec.ambush, lookouts: spec.diff?.lookouts }), spec.site?.memory || null);
}

// Note: the one place a finished scene is handed back to the campaign; override lets the interface report a scene the player left unfinished as a failure.
export function finishScene(campaign, sim, spec, override = null) {
  // Note: item 488: the lasting changes go back with the report so the case can keep them.
  const report = { ...sim.report(), site: captureSite(sim) };
  return campaign.applyEncounter(override ? { ...report, ...override } : report, spec);
}
