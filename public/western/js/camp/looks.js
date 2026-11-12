// Note: a named character's look (item 311): face parts and attire as palette indices, seeded by the campaign and the name, with no DOM and no campaign dice.

import { rng as makeRng, seedFromString } from '../rand.js';
import { C } from '../palette.js';
import { outfitFor } from '../people.js';

export const SKINS = [C.ADOBE_L, C.ADOBE, C.ADOBE_D, C.PLASTER, C.WOOD_L, C.WOOD];
export const HAIRS = [C.SHADOW, C.WOOD_D, C.WOOD_L, C.SAND, C.RED_L, C.STONE_L, C.PLASTER];
export const HAIR_STYLES = ['short', 'long', 'bald', 'curly', 'parted'];
// Note: a woman's hair of the 1880s: a bun, two braids, worn loose, a curled fringe with a knot, or one plait over the shoulder.
export const HAIR_STYLES_F = ['bun', 'braids', 'loose', 'fringe', 'plait'];
export const BEARDS = ['none', 'none', 'stubble', 'full', 'goatee', 'chops'];
export const MOUSTACHES = ['none', 'thin', 'walrus', 'handlebar'];
export const SCARS = [null, null, null, 'cheek', 'brow', 'lip'];
export const EYES = [C.BLUE_D, C.WOOD_D, C.SHADOW, C.GREEN_D, C.STONE];
// Note: attire for people outside the office: a hat, a coat, a vest and maybe a bandana, in the outlaw reds and darks or plain range colours.
const ATTIRE = {
  outlaw: { hats: [C.DARK, C.SHADOW, C.WOOD_D, C.PLANK], coats: [C.DARK, C.ADOBE_D, C.WOOD_D, C.RED_D, C.IRON], vests: [C.RED_D, C.DARK, C.WOOD, C.IRON], bands: [C.RED, C.PLANK, C.GOLD, C.RED_D], bandanas: [C.RED, C.RED_D, C.RED_L, null] },
  gunslinger: { hats: [C.DARK, C.SHADOW, C.PLANK_L, C.STONE_L], coats: [C.DARK, C.BLUE_D, C.WOOD_D, C.STONE], vests: [C.RED_D, C.GOLD, C.DARK, C.GREEN_D], bands: [C.GOLD, C.BONE, C.RED, C.IRON], bandanas: [null, null, C.BLUE, C.RED_L] },
};
const HAT_STYLES = ['wide', 'round', 'pinched', 'flat'];
const LAW = new Set(['sheriff', 'deputy']);

// Note: the stream for one person; the same campaign and name always give the same look, and nothing is drawn from the campaign's dice.
export const lookStream = (seed, name) => makeRng(seedFromString(`look:${seed}:${name}`));

// Note: kind is 'sheriff', 'deputy', 'hire', 'nemesis', 'associate' or 'gunslinger'; sex 'm' or 'f'; slot picks the deputy dress (0 to 3).
export function makeLook(seed, name, kind = 'hire', o = {}) {
  const r = lookStream(seed, name);
  const female = o.sex === 'f';
  const age = r.int(0, 2);
  const look = {
    kind,
    sex: female ? 'f' : 'm',
    skin: r.pick(SKINS),
    hair: age === 2 && r.chance(0.5) ? r.pick([C.STONE_L, C.PLASTER]) : r.pick(HAIRS.slice(0, 5)),
    hairStyle: female ? r.pick(HAIR_STYLES_F) : r.pick(HAIR_STYLES),
    beard: female ? 'none' : r.pick(BEARDS),
    moustache: female ? 'none' : r.pick(MOUSTACHES),
    eyes: r.pick(EYES),
    brow: r.int(0, 2),
    jaw: r.int(0, 2),
    nose: r.int(0, 2),
    age,
    scar: r.pick(SCARS),
  };
  Object.assign(look, attireOf(r, kind, o.slot ?? seedFromString(name) % 4));
  // Note: a nemesis always carries one mark to be remembered by.
  if (kind === 'nemesis' && !look.scar) look.scar = r.pick(['cheek', 'brow', 'lip']);
  if (female) Object.assign(look, womanDress(r, kind, look));
  return look;
}

// Note: a woman's dress, drawn after everything else so a man's look never moves: a bodice and blouse, maybe a shawl, a bonnet, a wide hat or none.
const DRESSES = [C.BLUE, C.STONE, C.GREEN, C.WOOD, C.ADOBE_D, C.BLUE_D, C.RED_D, C.GREEN_D];
const SHAWLS = [C.RED_L, C.BONE, C.SAND_D, C.GOLD, null, null, null, null];
const RIBBONS = [C.RED_L, C.BLUE, C.GOLD, C.GREEN, C.RED_D];
function womanDress(r, kind, look) {
  const ribbon = r.pick(RIBBONS);
  const shawl = r.pick(SHAWLS);
  if (kind !== 'hire') return { ribbon, shawl: shawl === look.coat ? null : shawl, vest: null };
  const coat = r.pick(DRESSES);
  const head = r.pick(['bare', 'bare', 'bonnet', 'wide']);
  const hat = head === 'bare' ? { hat: null, band: null, hatStyle: null }
    : head === 'bonnet' ? { hat: r.pick([C.BLUE_D, C.STONE_L, C.BONE, C.WOOD, C.SAND_D]), band: ribbon, hatStyle: 'bonnet' }
      : { hat: r.pick([C.DARK, C.PLANK_L, C.WOOD_D, C.STONE_L]), band: ribbon, hatStyle: 'wide' };
  return { ...hat, coat, vest: null, bandana: null, shirt: r.pick([C.PLASTER_L, C.BONE, C.PLASTER]), shawl: shawl === coat ? C.BONE : shawl, ribbon };
}

function attireOf(r, kind, slot) {
  if (LAW.has(kind) || kind === 'hire') {
    const base = outfitFor(kind === 'deputy' && slot > 0 ? `deputy${slot + 1}` : kind === 'hire' ? 'man' : kind);
    return { hat: base.hat, band: base.band, hatStyle: base.hatStyle, coat: base.coat, vest: base.vest ?? null, shirt: base.shirt, bandana: base.bandana ?? null, badge: LAW.has(kind) };
  }
  const t = ATTIRE[kind === 'gunslinger' ? 'gunslinger' : 'outlaw'];
  return { hat: r.pick(t.hats), band: r.pick(t.bands), hatStyle: r.pick(HAT_STYLES), coat: r.pick(t.coats), vest: r.pick(t.vests), shirt: r.pick([C.STONE, C.PLASTER, C.IRON, C.BONE]), bandana: r.pick(t.bandanas), badge: false };
}

// Note: a lawman's look follows the star: the same face in the sheriff's or a deputy's dress.
export function asRole(look, role, slot = 0) {
  if (!look || !LAW.has(role)) return look;
  const base = outfitFor(role === 'deputy' && slot > 0 ? `deputy${slot + 1}` : role);
  return { ...look, kind: role, hat: base.hat, band: base.band, hatStyle: base.hatStyle, coat: base.coat, vest: base.vest ?? null, shirt: base.shirt, bandana: base.bandana ?? null, badge: true };
}

// Note: a campaign character's portrait: the face from the campaign and the name, the dress from the role it holds now.
export const lookOf = (state, c) => asRole(makeLook(state.seed, c.name, c.role === 'sheriff' || c.role === 'deputy' ? 'deputy' : 'hire', { sex: c.sex }), c.role, seedFromString(c.name) % 4);

// Note: what a screen needs to paint a character: the look and the marks of the wounds now.
export const portraitOf = (state, c) => ({ look: lookOf(state, c), marks: woundMarks(c.injuries) });

// Note: the parts of the sprite a look decides, as one short key; people.js reads it back, so the portrait and the sprite agree.
export const faceCode = (l) => (l ? [l.skin, l.hair, l.hat ?? 'n', l.band ?? 'n', l.hatStyle || 'round', l.coat, l.vest ?? 'n', l.bandana ?? 'n', l.shirt ?? 'n'].join('.') : '');

// Note: the portrait's layers bottom to top; marks are woundMarks of the character's injuries.
export function portraitLayers(look, marks = []) {
  const f = look.sex === 'f';
  const layers = ['backdrop', 'shoulders'];
  if (look.shawl != null) layers.push('shawl');
  layers.push('neck');
  if (f) layers.push('collar');
  layers.push('face', 'eyes');
  if (f) layers.push('lashes');
  layers.push('brow', 'nose', 'mouth');
  if (f) layers.push('lips');
  if (look.age > 0) layers.push('lines');
  if (look.hairStyle !== 'bald' || !look.hat) layers.push(`hair:${look.hairStyle}`);
  if (look.beard !== 'none') layers.push(`beard:${look.beard}`);
  if (look.moustache !== 'none') layers.push(`moustache:${look.moustache}`);
  if (look.scar) layers.push(`scar:${look.scar}`);
  if (look.bandana != null) layers.push('bandana');
  if (look.badge) layers.push('badge');
  if (look.hat != null) layers.push(`hat:${look.hatStyle}`);
  for (const w of marks) layers.push(`wound:${w}`);
  return layers;
}

// Note: what a portrait shows of the injuries: a fresh wound by region, and the old scar of a lasting head wound.
export function woundMarks(injuries = []) {
  const out = new Set();
  for (const i of injuries) {
    const region = i.region === 'abdomen' ? 'chest' : i.region;
    if (!['head', 'chest', 'arm', 'leg'].includes(region)) continue;
    if (i.lasting) {
      if (region === 'head') out.add('old-head');
      continue;
    }
    if ((i.healed || 0) >= 0.95) continue;
    out.add(region);
  }
  return [...out].sort();
}
