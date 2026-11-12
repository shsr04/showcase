// Note: the storyboards of items 378 and 380–392 as data: each scene is a list of panels with its setting, cast, caption and cues; pure, no DOM, so a seeded test can read every panel.

import { leadCastSide } from './lead-map.js';

// Note: a panel holds this long before it moves on by itself, more for a longer caption (item 394).
export const PACE = Object.freeze({ hold: 2600, perChar: 28, most: 7000, voiced: 1200 });

// Note: the frequent scenes, which play in full the first time in a campaign and as their key panel afterwards (item 395).
export const REPEATS = Object.freeze(['arrival', 'lead', 'deputy', 'challenge', 'outcome', 'brawl-open', 'brawl-after', 'crew-death']);

// Note: a cast member: the portrait, the name and how it is marked; the nemesis's likeness carries his traits (items 300, 374).
export const castOf = (who, mark = null, o = {}) => (who ? { portrait: who.portrait, name: who.name, traits: who.traits || null, mark, nemesis: !!who.nemesis, ...o } : null);

function panel(p) {
  const caption = p.caption || null;
  const read = caption ? Math.min(PACE.most - PACE.hold, caption.length * PACE.perChar) : 0;
  const voiced = p.say ? PACE.voiced + 65 * Math.min(60, p.say.text.length) : 0;
  return { cast: [], cues: [], art: {}, say: null, then: null, choice: null, ...p, caption, cast: (p.cast || []).filter(Boolean), hold: p.hold ?? Math.max(PACE.hold + read, voiced + 800) };
}

const lookOf = (who) => (who && who.portrait ? who.portrait.look : null);

// Note: item 378: the window, the glimpse, the office, the star and the face; no oath (item 379).
export function openingScene({ deputy, sheriffLook, nemesis, murdered, town, date, funds, mood = 'dusk' }) {
  return {
    kind: 'opening',
    panels: [
      panel({ id: 'window', setting: 'window', art: { mood, deputy: lookOf(deputy), nemesis: lookOf(nemesis), victim: lookOf(murdered) }, caption: `${town}, ${date}.`, cues: [['shot', 500]], }),
      panel({ id: 'glimpse', setting: 'glimpse', castAt: 'left', art: { mood, nemesis: lookOf(nemesis) }, cast: [castOf(nemesis, 'wanted')], cues: [['horse', 200], ['horse', 1100]]}),
      panel({ id: 'office', setting: 'office', art: { victim: lookOf(murdered) }, caption: `Sheriff ${murdered.name}, shot dead.`, cues: [['toll', 400]], }),
      panel({ id: 'star', setting: 'star', art: { deputy: lookOf(deputy) }, caption: `${deputy.name} takes up the star.` }),
      panel({ id: 'face', setting: 'face', art: { mood: 'dawn', deputy: sheriffLook || lookOf(deputy) }, cast: [castOf({ ...deputy, portrait: { ...deputy.portrait, look: sheriffLook || lookOf(deputy) } }, null, { big: true })], caption: `Alone, with a horse and ${funds}, after ${nemesis.name}.`, cues: [['pin', 600]]}),
    ],
  };
}

// Note: item 380: the oath, the badge, the vow before every fallen sheriff, and the trail.
export function successionScene({ who, oath, fallen = [], nemesis, place = null, lastLead = null }) {
  const trail = place ? `${nemesis.name} waits at ${place}.` : lastLead ? `The last word: ${lastLead}` : `Where ${nemesis.name} rides, nobody knows.`;
  return {
    kind: 'succession',
    panels: [
      panel({ id: 'oath', setting: 'oath', art: { who: lookOf(who) }, caption: `“${oath}”`, captionCls: 'is-oath', say: { text: oath.split(',')[0], role: 'sheriff', at: 700 }, cues: [['swear', 150]]}),
      panel({ id: 'badge', setting: 'badge', art: { who: lookOf(who) }, cast: [castOf(who)], caption: `${who.name}, now sheriff.`, cues: [['pin', 500]]}),
      panel({ id: 'vow', setting: 'vow', art: { who: lookOf(who), fallen: fallen.length }, cast: fallen.map((f) => castOf(f, 'memory')), caption: 'Vengeance for all who wore the star.' }),
      panel({ id: 'trail', setting: 'trail', art: { place: place || '', nemesis: lookOf(nemesis) }, cast: [castOf(nemesis)], caption: trail }),
    ],
  };
}

// Note: item 381: the oath on the boardwalk before the townsfolk, then the badge; the key panel is the badge with the oath, the bell and the pinning (item 395).
export function deputyScene({ sheriff, deputy, oath }) {
  const say = { text: oath.split(',')[0], role: 'deputy', at: 700 };
  return {
    kind: 'deputy',
    panels: [
      panel({ id: 'oath', setting: 'boardwalk', art: { crowd: 6, sheriff: lookOf(sheriff), deputy: lookOf(deputy) }, caption: `“${oath}”`, captionCls: 'is-oath', say, cues: [['swear', 150]]}),
      panel({ id: 'badge', setting: 'badge', art: { who: lookOf(deputy), pinner: lookOf(sheriff) }, caption: `${deputy.name}, joining the office.`, cues: [['pin', 500]]}),
    ],
    key: () => panel({ id: 'badge', setting: 'boardwalk', art: { crowd: 6, sheriff: lookOf(sheriff), deputy: lookOf(deputy) }, castAt: 'right', cast: [castOf(deputy)], caption: `“${oath}”`, captionCls: 'is-oath', say, cues: [['swear', 150], ['pin', 2600]]}),
  };
}

// Note: item 382: the approach and the street; the street's crowd grows with the town (item 336).
export function arrivalScene({ town, when, people, size = 0, sound = 0, party = [], mood = 'day' }) {
  const caption = `${town}. ${when}. ${people}.`;
  const street = () => panel({ id: 'street', setting: 'street', art: { size, mood }, cues: [[`town${sound}`, 200]] });
  const approach = (key) => panel({ id: 'approach', setting: 'approach', art: { mood, size, party: party.map(lookOf) }, caption, cues: [['horse', 50], ...(key ? [[`town${sound}`, 900]] : [])]});
  return {
    kind: 'arrival',
    panels: [
      approach(false),
      street(),
    ],
    key: () => approach(true),
  };
}

export const SOURCE_SET = { case: 'papers', saloon: 'table', road: 'road', body: 'body', belongings: 'belongings', witness: 'witness', questioned: 'plain' };

// Note: item 383: where the word came from, then the word with the map; a questioned associate is shown by portrait only.
export function leadScene({ source, sourceText, subject, associate = null, associateOf = null, place, learned, date }) {
  const told = `${learned} As of ${date}.`;
  // Note: in the full scene a case lead's papers speak for themselves and a witness speaks; the shortened vignette always tells the source, what was learned and the date it was true (item 395).
  const wording = (key) => (key && source === 'witness' ? `“He was headed for ${place}. That was ${date}.”` : key ? `${sourceText}. ${told}` : source === 'case' ? null : told);
  const word2 = (key) => panel({ id: 'word', setting: key ? 'leadmap' : 'word', castAt: key ? leadCastSide(SOURCE_SET[source] || 'plain') : null, art: { place, source: key ? SOURCE_SET[source] || 'plain' : null, associate: lookOf(associate || subject) }, cast: [castOf(subject, null, associateOf ? { role: `Associate of ${associateOf}` } : {})], caption: wording(key), cues: [['lead', 300]]});
  return {
    kind: 'lead',
    panels: [
      panel({ id: 'source', setting: SOURCE_SET[source] || 'plain', art: { associate: lookOf(associate) }, cast: source === 'questioned' ? [castOf(associate)] : [], caption: source === 'case' ? null : `${sourceText}.` }),
      word2(false),
    ],
    key: () => word2(true),
  };
}

// Note: item 384: the challenge, the reply, the walk out through the saloon doors, and the face-off; persuade offers the choice after the reply.
// Note: mine is the duelist of the sheriff's side, who stands on the left as in the duel view; the face-off and doors painters put a on the left, the street and saloon painters b.
export function challengeScene({ challenger, challenged, mine = challenged, line, reply, roles, saloon = false, persuade = null, crew = [], witnesses = true, mood = 'day', final = false }) {
  const sayLine = { text: line, role: roles[0], id: 0, at: 500 };
  const sayReply = { text: reply, role: roles[1], id: 1, at: 500 };
  const theirs = mine === challenger ? challenged : challenger;
  const faceoffArt = { mood, a: lookOf(mine), b: lookOf(theirs), crew: crew.map(lookOf), crowd: witnesses ? 7 : 1 };
  const streetArt = { a: lookOf(theirs), b: lookOf(mine) };
  const sided = (who, extra = {}) => castOf(who, null, { side: who === mine ? 'left' : 'right', ...extra });
  const faceoff = () => panel({ id: 'faceoff', setting: 'faceoff', art: faceoffArt });
  // Note: item 395: the challenge panel with the reply, both duelists at the place of the challenge amid the onlookers.
  const confront = () => panel({
    id: 'challenge', setting: saloon ? 'saloon' : 'street', art: { mood, size: witnesses ? 1 : 0, ...streetArt },
    cast: saloon ? [sided(challenger, { small: true }), sided(challenged, { small: true })] : [],
    caption: `“${line}” — “${reply}”`,
    say: sayLine,
    then: { ...sayReply, at: sayLine.at + 900 + 65 * Math.min(40, line.length) },
    choice: persuade,
  });
  return {
    kind: 'challenge',
    final,
    panels: [
      panel({ id: 'challenge', setting: saloon ? 'saloon' : 'street', art: { mood, size: witnesses ? 1 : 0, ...streetArt }, cast: [sided(challenger), sided(challenged)], caption: `“${line}”`, say: sayLine }),
      panel({ id: 'reply', setting: saloon ? 'saloon' : 'street', art: { mood, size: witnesses ? 1 : 0, ...streetArt }, cast: saloon ? [castOf(challenged, null, { big: true })] : [], caption: `“${reply}”`, say: sayReply, choice: persuade }),
      // Note: the doors are filmed from behind the two men, so that painter puts a on the left.
      saloon ? panel({ id: 'walkout', setting: 'doors', art: { mood, a: lookOf(mine), b: lookOf(theirs) }, cues: [['doors', 200]]}) : null,
      faceoff(),
    ].filter(Boolean),
    key: confront,
  };
}

// Note: item 386: the smoke, the victor and, when someone died and no death scene or ending follows, the fallen.
export function outcomeScene({ victor = null, fallen = [], dead = [], draw = false, judgment = null, final = false, nemesisDied = false, deathFollows = false, winFollows = false, standing = [], mood = 'day', victorSide = 'right' }) {
  const died = dead.length > 0;
  const deadNames = new Set(dead.map((d) => d.name));
  const mark = (f) => (deadNames.has(f.name) ? 'dead' : 'fallen');
  const finalWon = final && nemesisDied;
  const tolls = died && !deathFollows && !finalWon;
  const smokeCues = finalWon ? [['echo', 300], ['wind', 1500]] : tolls ? [['toll', 400]] : [];
  const smokeArt = { mood: final ? 'grey' : mood, fallen: fallen.map(lookOf), blood: died, standing: draw ? null : lookOf(victor), side: victorSide };
  // Note: items 386 and 395: the smoke over the ground with the portrait of the fallen, and any judgment.
  // Note: item 374: everyone portrayed is named, the victor on his side and the fallen on the other.
  const other = victorSide === 'left' ? 'right' : 'left';
  const named = [...(victor && !draw ? [castOf(victor, null, { side: victorSide })] : []), ...fallen.map((f) => castOf(f, mark(f), { side: victor && !draw ? other : undefined }))];
  // Note: item 386: panel 1 the smoke with the fallen, panel 2 the victor with any judgment (in a draw both fallen instead), panel 3 the dead when no death scene or ending follows; item 395 repeats the smoke alone, with everyone and the judgment.
  // Note: panel 1 always paints the shooter standing behind his own gunsmoke; his portrait first appears in panel 2.
  const smoke = (key) => panel({ id: 'smoke', setting: 'smoke', art: smokeArt, cast: key ? named : fallen.map((f) => castOf(f, 'fallen')), caption: key ? judgment : null, cues: smokeCues });
  const second = draw
    ? panel({ id: 'fallen-both', setting: 'plain', art: {}, cast: fallen.map((f) => castOf(f, 'fallen')), caption: judgment })
    : panel({ id: 'victor', setting: 'plain', art: {}, cast: [castOf(victor)], caption: judgment });
  const third = died && !deathFollows && !winFollows ? panel({ id: 'dead', setting: 'plain', art: { dark: true }, cast: dead.map((f) => castOf(f, 'dead')), caption: `${dead.map((f) => f.name).join(' and ')}, dead.` }) : null;
  const panels = [smoke(false), victor || draw ? second : null, third].filter(Boolean);
  return { kind: 'outcome', final, panels, key: () => smoke(true) };
}

// Note: item 387: the glass, then the fighters on their two sides with the one who started it marked.
export function brawlOpenScene({ sides, starter }) {
  const cast = [...sides[0].map((f) => castOf(f, f.started ? 'started' : null, { side: 'left' })), ...sides[1].map((f) => castOf(f, f.started ? 'started' : null, { side: 'right' }))];
  const startedIt = `${starter} started it.`;
  const fighters = () => panel({ id: 'fighters', setting: 'fighters', art: {}, cast, caption: startedIt });
  // Note: item 395: the glass smashing between both sides, with who started it marked in that confrontation.
  const glass = (key) => panel({ id: 'glass', setting: 'glass', art: {}, cast: key ? cast : [], caption: key ? startedIt : null, cues: [['doors', 80], ['crowd', 600]]});
  return {
    kind: 'brawl-open',
    panels: [
      glass(false),
      fighters(),
    ],
    key: () => glass(true),
  };
}

// Note: item 388: the wrecked room with the injured, then the bill when there are costs.
// Note: injured are the hurt crew by portrait, their wounds on it; injuries are the words for each injury.
export function brawlAfterScene({ injuries = [], injured = [], costs = [] }) {
  const room = (key) => panel({
    id: 'room', setting: 'wreck', art: key && costs.length ? { coins: Math.min(9, 3 + costs.length * 2), report: {}, billLines: costs } : {},
    cast: injured.map((p) => castOf(p)).filter(Boolean),
    caption: injuries.length ? injuries.join(' ') : 'Nobody is badly hurt.',
    cues: key && costs.length ? [['coin', 400]] : [],
  });
  return {
    kind: 'brawl-after',
    panels: [
      room(false),
      costs.length ? panel({ id: 'bill', setting: 'bill', art: { coins: Math.min(9, 3 + costs.length * 2) }, caption: costs.join(' '), cues: [['coin', 400]], }) : null,
    ].filter(Boolean),
    key: () => room(true),
  };
}

// Note: item 389: the fallen with one low toll, then the crew at the grave, hats in hand.
export function crewDeathScene({ fallen, how, survivors = [], date }) {
  const death = `${fallen.name}. ${how}`;
  const first = panel({ id: 'fallen', setting: 'plain', art: { dark: true }, cast: [castOf(fallen, 'fallen', { big: true })], caption: death, cues: [['toll', 300]], });
  // Note: item 395: Hats off with a memorial likeness at the marker; the death is integrated and the toll sounds once.
  const hats = (key) => panel({ id: 'hats', setting: 'grave', art: { mood: 'grey', crew: survivors.slice(0, 6).map(lookOf), name: fallen.name, date, report: {} }, cast: key ? [castOf(fallen, 'fallen', { top: true })] : [], caption: key ? death : null, cues: key ? [['toll', 300]] : [] });
  return {
    kind: 'crew-death',
    key: () => hats(true),
    panels: [
      first,
      hats(false),
    ],
  };
}

// Note: item 390: the fallen sheriff with three tolls, the grave, and the star lifted for a successor or left on the marker.
export function sheriffDeathScene({ fallen, how, crew = [], date, successor = false }) {
  const alone = crew.length === 0;
  // Note: the marker carries the title, as the murdered sheriff's old grave does (item 391).
  const name = `Sheriff ${fallen.name}`;
  const tolls = [300, 1500, 2700];
  return {
    kind: 'sheriff-death',
    panels: [
      panel({ id: 'fallen', setting: 'plain', art: { dark: true, darker: true }, cast: [castOf(fallen, 'fallen', { big: true, darker: true })], caption: `Sheriff ${fallen.name}. ${how}`, cues: tolls.map((t) => ['toll', t]), hold: 4200 }),
      panel({ id: 'hats', setting: 'grave', art: { mood: 'grey', crew: crew.slice(0, 6).map(lookOf), name, date, dust: alone }}),
      alone ? null : successor
        ? panel({ id: 'star', setting: 'grave', art: { mood: 'grey', name, date, star: true, lift: -26 }, cues: [['star', 500]]})
        : panel({ id: 'star', setting: 'grave', art: { mood: 'grey', crew: crew.slice(0, 6).map(lookOf), leave: true, name, date, star: true } }),
    ].filter(Boolean),
  };
}

// Note: item 391: the reckoning, the old grave, the star laid down and the last ride.
export function winScene({ nemesis, sheriff, murdered, murderDate }) {
  return {
    kind: 'win',
    panels: [
      panel({ id: 'reckoning', setting: 'reckoning', castAt: 'right', art: { nemesis: lookOf(nemesis) }, cast: [castOf(nemesis, 'dead')], cues: [['brass', 300]]}),
      panel({ id: 'oldgrave', setting: 'oldgrave', art: { sheriff: lookOf(sheriff), name: murdered.name, date: murderDate }, cast: [castOf(sheriff), castOf(murdered, 'memory')] }),
      panel({ id: 'laydown', setting: 'laydown', art: { sheriff: lookOf(sheriff), name: murdered.name, date: murderDate } }),
      panel({ id: 'ride', setting: 'ride', art: { sheriff: lookOf(sheriff) }, caption: 'The end.', captionCls: 'is-end' }),
    ],
  };
}

// Note: the failure ending, as the user directed over item 392: the old sheriff's desk left abandoned with the toll, then the wanted poster in the wind.
export function failScene({ nemesis }) {
  return {
    kind: 'fail',
    panels: [
      panel({ id: 'desk', setting: 'abandoned', art: { mood: 'grey' }, cues: [['toll', 300]]}),
      panel({ id: 'poster', setting: 'poster', castAt: 'right', art: { name: nemesis.name, nemesis: lookOf(nemesis) }, cast: [castOf(nemesis, 'wanted')], caption: `${nemesis.name} is still at large. Nobody will come looking for him.`}),
    ],
  };
}

// Note: a frequent scene seen before in this campaign shows only its key panel; every other scene plays in full (item 395).
export function staged(scene, seen) {
  if (!scene || !REPEATS.includes(scene.kind) || scene.final || !seen || !scene.key) return { ...scene, full: true };
  return { ...scene, full: false, panels: [scene.key()] };
}
