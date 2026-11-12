// Note: people are drawn in texels (1/32 m, x forward, y to the right); a texel is SCALE/2 device pixels, so figures keep their shape at any SCALE.

import { C } from './palette.js';
import { SCALE } from './config.js';
import { pen, tone, makeTextureCanvas } from './draw.js';
import { WEAPONS } from './weapons.js';
import { GUN_PARTS, gunOpsFor } from './gunart.js';

const Q = pen(SCALE / 2);
// Note: texture pixels per game pixel; people are drawn at the size they are shown, so no extra density is needed.
export const DENSE = 1;
const PSIZE = 80;
const PC = PSIZE / 2;
export const PERSON_SIZE = PSIZE;
// Note: the cache holds at most this many person textures (about 60 KB each at SCALE 3); the least recently used are dropped first.
export const PEOPLE_MAX = 320;

function brush(ctx) {
  return {
    r: (col, x, y, w = 1, h = 1) => Q.rect(ctx, col, PC + x, PC + y, w, h),
    e: (col, x, y, rx, ry = rx) => Q.ell(ctx, col, PC + x, PC + y, rx, ry),
    l: (col, x0, y0, x1, y1, w = 1) => Q.line(ctx, col, PC + x0, PC + y0, PC + x1, PC + y1, w),
    g: (col, pts) => Q.poly(ctx, col, pts.map(([x, y]) => [PC + x, PC + y])),
  };
}

// Note: a brush moved oy texels to the right, for the upper body of a lean.
function shifted(B, oy) {
  if (!oy) return B;
  return {
    r: (col, x, y, w, h) => B.r(col, x, y + oy, w, h),
    e: (col, x, y, rx, ry) => B.e(col, x, y + oy, rx, ry),
    l: (col, x0, y0, x1, y1, w) => B.l(col, x0, y0 + oy, x1, y1 + oy, w),
    g: (col, pts) => B.g(col, pts.map(([x, y]) => [x, y + oy])),
  };
}

// Note: a lean bends at the hips; the shoulders go this share of the head's offset, so the head stays over the near shoulder and the gun stays in the hands.
const LEAN_BODY = 0.75;
// Note: in a lean an arm starts no further forward than this, in texels ahead of the body's own shift; the chest's front edge is at 4.5.
const LEAN_SHOULDER = 3;

const OUTLINE = C.DARK;
// Note: strokes finer than a device pixel only add noise at SCALE 1, so the fine detail is skipped there.
const FINE = SCALE > 1;

const OUTFIT = {
  sheriff: { shirt: C.PLASTER, coat: C.ADOBE, vest: C.WOOD_D, pants: C.WOOD_D, hat: C.PLANK_L, band: C.WOOD_D, hatStyle: 'wide', skin: C.ADOBE_L, badge: C.GOLD_L, belt: true },
  deputy: { shirt: C.PLASTER, coat: C.BLUE_D, vest: C.DARK, pants: C.DARK, hat: C.STONE_L, band: C.IRON, hatStyle: 'round', skin: C.ADOBE_L, badge: C.GOLD, belt: true },
  deputy2: { shirt: C.PLASTER, coat: C.GREEN_D, vest: C.WOOD_D, pants: C.WOOD_D, hat: C.PLANK, band: C.GREEN_D, hatStyle: 'wide', skin: C.ADOBE, badge: C.GOLD, belt: true },
  deputy3: { shirt: C.PLASTER_L, coat: C.STONE, vest: C.IRON, pants: C.BLUE_D, hat: C.WOOD_D, band: C.GOLD, hatStyle: 'pinched', skin: C.ADOBE_L, badge: C.GOLD, belt: true },
  deputy4: { shirt: C.PLASTER, coat: C.ADOBE_D, vest: C.BLUE_D, pants: C.WOOD, hat: C.SHADOW, band: C.GOLD, hatStyle: 'flat', skin: C.ADOBE, badge: C.GOLD, duster: true, belt: true },
  green: { shirt: C.RED, coat: C.STONE, vest: C.RED_D, pants: C.IRON, hat: C.PLANK, band: C.RED_D, hatStyle: 'round', skin: C.ADOBE_L, bandana: C.RED_L, belt: true },
  seasoned: { shirt: C.STONE, coat: C.ADOBE_D, vest: C.DARK, pants: C.WOOD_D, hat: C.DARK, band: C.PLANK, hatStyle: 'pinched', skin: C.ADOBE, bandana: C.RED_D, belt: true },
  veteran: { shirt: C.IRON, coat: C.WOOD_D, vest: C.RED_D, pants: C.DARK, hat: C.SHADOW, band: C.RED_D, hatStyle: 'wide', skin: C.ADOBE, bandana: C.RED, duster: true, belt: true },
  woman: { shirt: C.PLASTER_L, coat: C.BLUE, pants: C.BLUE_D, hat: null, hair: C.WOOD_D, skin: C.ADOBE_L, shawl: C.RED_L },
  man: { shirt: C.PLASTER, coat: C.GREEN, vest: C.WOOD_D, pants: C.WOOD_D, hat: C.DARK, band: C.DARK, hatStyle: 'round', skin: C.ADOBE_L },
  boy: { shirt: C.PLASTER, coat: C.SAND_D, vest: C.WOOD, pants: C.WOOD, hat: C.STONE, band: C.STONE, hatStyle: 'cap', skin: C.ADOBE_L },
  // Note: ordinary saloon patrons; a civilian's kind picks one of these, so none of them changes an existing person key.
  cowhand: { shirt: C.RED_L, coat: C.SAND_D, vest: C.WOOD_D, pants: C.BLUE_D, hat: C.PLANK_L, band: C.RED_D, hatStyle: 'wide', skin: C.ADOBE, bandana: C.BLUE, belt: true },
  miner: { shirt: C.PLASTER, coat: C.ADOBE_D, vest: C.IRON, pants: C.WOOD_D, hat: C.WOOD, band: C.DARK, hatStyle: 'flat', skin: C.ADOBE },
  gambler: { shirt: C.BONE, coat: C.DARK, vest: C.RED_D, pants: C.DARK, hat: C.DARK, band: C.GOLD, hatStyle: 'flat', skin: C.ADOBE_L },
  townsman: { shirt: C.PLASTER_L, coat: C.STONE, vest: C.BLUE_D, pants: C.IRON, hat: C.IRON, band: C.DARK, hatStyle: 'round', skin: C.ADOBE_L },
  drover: { shirt: C.PLASTER, coat: C.GREEN_D, vest: C.PLANK, pants: C.WOOD_D, hat: C.PLANK, band: C.GREEN_D, hatStyle: 'pinched', skin: C.ADOBE, bandana: C.RED_L, duster: true },
  rancher: { shirt: C.PLASTER, coat: C.WOOD, vest: C.BLUE_D, pants: C.DARK, hat: C.PLANK_L, band: C.WOOD_D, hatStyle: 'wide', skin: C.ADOBE_L, belt: true },
  dancer: { shirt: C.RED_L, coat: C.RED_D, pants: C.RED_D, hat: null, hair: C.WOOD_D, skin: C.ADOBE_L, shawl: C.GOLD },
  singer: { shirt: C.PLASTER_L, coat: C.GREEN_D, pants: C.GREEN_D, hat: null, hair: C.SAND_D, skin: C.ADOBE_L, shawl: C.BONE },
  barkeep: { shirt: C.PLASTER_L, coat: C.PLASTER, vest: C.DARK, pants: C.DARK, hat: null, hair: C.WOOD_D, skin: C.ADOBE_L },
  pianist: { shirt: C.PLASTER_L, coat: C.DARK, vest: C.GOLD, pants: C.DARK, hat: C.SHADOW, band: C.GOLD, hatStyle: 'round', skin: C.ADOBE_L },
  // Note: more saloon kinds; the scene may name them in its patron lists.
  clerk: { shirt: C.PLASTER_L, coat: C.STONE, vest: C.WOOD_L, pants: C.IRON, hat: C.DARK, band: C.IRON, hatStyle: 'bowler', skin: C.ADOBE_L },
  soldier: { shirt: C.PLASTER, coat: C.BLUE_D, vest: C.GOLD, pants: C.BLUE, hat: C.BLUE_D, band: C.GOLD, hatStyle: 'cap', skin: C.ADOBE_L, belt: true },
  shopkeeper: { shirt: C.PLASTER_L, coat: C.STONE, pants: C.IRON, hat: null, hair: C.WOOD_D, skin: C.ADOBE_L, apron: C.BONE },
};

// Note: each hostile id picks one of these looks, so the men inside do not all dress alike; they stay in reds and darks.
const LOOKS = [
  {},
  { poncho: C.RED_D, hat: C.WOOD_D, hatStyle: 'wide', band: C.RED, bandana: C.RED },
  { duster: true, vest: C.RED_D, hatStyle: 'flat', bandana: C.RED_L },
  { shirt: C.RED, coat: C.DARK, hat: C.SHADOW, hatStyle: 'pinched', band: C.RED, bandana: C.RED_D },
];

export function variantOf(a) {
  if (a.role === 'hostile') return a.traits?.experience || 'seasoned';
  if (a.role === 'civilian') return a.kind || a.traits?.kind || ['woman', 'man', 'boy'][a.id % 3];
  // Note: the second to fourth deputy of a party (a.look 1 to 3) dress differently from the first and from each other.
  if (a.role === 'deputy' && a.look > 0 && a.look < 4) return `deputy${a.look + 1}`;
  return a.role;
}

export function weaponKind(a) {
  const w = a.weapons && a.weapons[a.cur];
  if (!w) return 'none';
  return WEAPONS[w.id]?.kind === 'rifle' ? 'rifle' : 'handgun';
}

// Note: the saloon's kinds of ordinary patron with their weights and the words a screen reader hears; the scene may take its lists from here.
export const PATRON_KINDS = {
  men: [['cowhand', 3], ['miner', 3], ['gambler', 2], ['townsman', 2], ['drover', 2], ['rancher', 1], ['clerk', 1], ['soldier', 1], ['shopkeeper', 1]],
  women: [['dancer', 3], ['singer', 1], ['woman', 1]],
  nouns: { cowhand: 'a cowhand', miner: 'a miner', gambler: 'a gambler', townsman: 'a townsman', drover: 'a drover', rancher: 'a rancher', clerk: 'a clerk', soldier: 'a soldier', shopkeeper: 'a shopkeeper', dancer: 'a dance-hall girl', singer: 'a singer', woman: 'a townswoman', barkeep: 'the barkeep', pianist: 'the piano player', deputy: 'one of your people' },
};

// Note: a patron's style number picks one of 24 coat and head-dress cores plus 360 extras.
const CORES = 24;
const EXTRAS = 360;
const SKIN = [C.ADOBE_L, C.ADOBE, C.ADOBE_D, C.PLASTER, C.WOOD_L];
const HAIR = [C.SHADOW, C.WOOD_D, C.WOOD_L, C.SAND, C.RED_L, C.STONE_L];
const BUILD = { m: [0.98, 1.06, 1.14, 1.2], f: [0.94, 1, 1.06, 1.1] };
const hat = (col, band, style) => ({ hat: col, band, hatStyle: style });
const bare = { hat: null };
// Note: per kind, six coats, four head-dresses and three trims; a trim adds a bandana, a vest, an apron, a cord or a shawl.
const STYLE = {
  cowhand: { coats: [C.RED, C.BLUE, C.PLASTER, C.GREEN, C.SAND_D, C.STONE], heads: [hat(C.PLANK, C.RED_D, 'wide'), hat(C.DARK, C.GOLD, 'wide'), hat(C.SAND_L, C.WOOD_D, 'pinched'), hat(C.WOOD_L, C.BLUE_D, 'round')], trims: [{ bandana: C.RED_L }, { bandana: C.BLUE }, { bandana: C.GOLD }] },
  miner: { coats: [C.ADOBE_D, C.STONE, C.WOOD_D, C.SAND_D, C.IRON, C.GREEN_D], heads: [hat(C.WOOD, C.DARK, 'flat'), hat(C.STONE, C.IRON, 'round'), hat(C.DARK, C.SAND_D, 'flat'), hat(C.SAND_D, C.WOOD_D, 'pinched')], trims: [{ vest: C.IRON }, { vest: C.RED_D, bandana: C.RED_L }, { vest: C.BLUE_D }] },
  gambler: { coats: [C.DARK, C.BLUE_D, C.GREEN_D, C.RED_D, C.IRON, C.WOOD_D], heads: [hat(C.DARK, C.GOLD, 'flat'), hat(C.IRON, C.RED_D, 'bowler'), hat(C.WOOD_D, C.BONE, 'flat'), hat(C.SHADOW, C.RED, 'pinched')], trims: [{ vest: C.RED }, { vest: C.GOLD }, { vest: C.GREEN }] },
  townsman: { coats: [C.STONE, C.BLUE_D, C.WOOD_D, C.GREEN_D, C.IRON, C.RED_D], heads: [hat(C.IRON, C.DARK, 'bowler'), hat(C.PLASTER, C.RED_D, 'round'), hat(C.WOOD_D, C.PLANK, 'bowler'), hat(C.STONE_L, C.BLUE_D, 'round')], trims: [{}, { apron: C.BONE }, { garters: C.RED }] },
  drover: { coats: [C.SAND_D, C.STONE, C.WOOD, C.GREEN_D, C.ADOBE_D, C.DARK], heads: [hat(C.PLANK, C.GREEN_D, 'wide'), hat(C.PLASTER, C.RED, 'sombrero'), hat(C.DARK, C.GOLD, 'wide'), hat(C.SAND, C.WOOD_D, 'pinched')], trims: [{ bandana: C.RED_L }, { bandana: C.BONE }, { bandana: C.BLUE }] },
  rancher: { coats: [C.WOOD, C.BLUE_D, C.DARK, C.STONE, C.GREEN_D, C.RED_D], heads: [hat(C.BONE, C.WOOD_D, 'wide'), hat(C.DARK, C.GOLD, 'wide'), hat(C.WOOD_L, C.RED_D, 'wide'), hat(C.STONE_L, C.BLUE_D, 'round')], trims: [{ vest: C.BLUE_D }, { vest: C.DARK }, { vest: C.RED_D }] },
  clerk: { coats: [C.STONE, C.BLUE_D, C.IRON, C.WOOD_D, C.GREEN_D, C.SAND_D], heads: [hat(C.GREEN, C.DARK, 'visor'), hat(C.DARK, C.IRON, 'bowler'), bare, hat(C.PLASTER, C.BLUE_D, 'round')], trims: [{ garters: C.RED }, { garters: C.BLUE }, { vest: C.WOOD_L }] },
  soldier: { coats: [C.BLUE_D, C.BLUE, C.IRON, C.STONE, C.GREEN_D, C.WOOD_D], heads: [hat(C.BLUE_D, C.GOLD, 'cap'), hat(C.BLUE, C.GOLD_L, 'cap'), hat(C.PLANK, C.BLUE_D, 'wide'), hat(C.DARK, C.GOLD, 'flat')], trims: [{ vest: C.GOLD }, { vest: C.RED }, { vest: C.BONE }] },
  shopkeeper: { coats: [C.STONE, C.BLUE_D, C.WOOD_D, C.GREEN_D, C.IRON, C.SAND_D], heads: [bare, hat(C.PLASTER, C.RED_D, 'round'), hat(C.IRON, C.DARK, 'bowler'), hat(C.GREEN, C.DARK, 'visor')], trims: [{ apron: C.BONE }, { apron: C.PLASTER_L }, { apron: C.SAND_L }] },
  dancer: { woman: true, coats: [C.RED_D, C.BLUE, C.GREEN, C.GOLD, C.RED_L, C.BLUE_D], heads: [{}, { plume: C.GOLD_L }, { ribbon: C.RED_L }, { plume: C.BONE }], trims: [{ shawl: C.GOLD }, { shawl: C.BONE }, { shawl: C.RED_L }] },
  singer: { woman: true, coats: [C.GREEN_D, C.BLUE_D, C.RED_D, C.BONE, C.PLASTER, C.GOLD], heads: [{}, { plume: C.RED_L }, { ribbon: C.GOLD_L }, { plume: C.BONE }], trims: [{ shawl: C.BONE }, { shawl: C.GOLD }, { shawl: C.RED_L }] },
  woman: { woman: true, coats: [C.BLUE, C.STONE, C.GREEN, C.WOOD, C.ADOBE_D, C.BLUE_D], heads: [{ hat: C.BLUE_D, band: C.RED_L, hatStyle: 'bonnet', bun: true }, {}, { ribbon: C.RED_L }, { hat: C.STONE_L, band: C.GREEN, hatStyle: 'bonnet', bun: true }], trims: [{ shawl: C.RED_L }, { shawl: C.BONE }, { shawl: C.SAND_D }] },
};

// Note: the FNV-1a loop of seedFromString (rand.js) without its final mix, so the patron looks that seeds already give stay as they are.
const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const PATRON_ID = /^patron-(\d+)$/;

// Note: 0 for everyone but a saloon patron (id patron-N, or an explicit style number); so every other person has the plain key and picture.
function styleOf(a) {
  if (a.role !== 'civilian' || !STYLE[a.kind]) return 0;
  const m = PATRON_ID.exec(String(a.id));
  const n = Number.isInteger(a.style) && a.style >= 0 ? a.style : m ? Number(m[1]) : -1;
  if (n < 0) return 0;
  return 1 + ((n * 7) % CORES) + CORES * (fnv(String(a.name ?? a.id)) % EXTRAS);
}

function styledOutfit(base, kind, st) {
  const spec = STYLE[kind];
  const core = (st - 1) % CORES;
  const ex = Math.floor((st - 1) / CORES);
  const head = spec.heads[Math.floor(core / 6)];
  const trim = spec.trims[Math.floor(ex / 120) % 3];
  const coat = spec.coats[core % 6];
  const hair = HAIR[Math.floor(ex / 5) % 6];
  const out = { ...base, coat, skin: SKIN[ex % 5], size: BUILD[spec.woman ? 'f' : 'm'][Math.floor(ex / 30) % 4], ...head, ...trim };
  if (spec.woman) {
    out.hair = hair;
    out.skirt = coat;
    out.pants = coat;
    if (out.shawl === coat) out.shawl = C.BONE;
    return out;
  }
  if (out.hat === null) out.hair = hair;
  else if (out.hatStyle === 'visor') out.hair = hair;
  if (kind === 'townsman' || kind === 'shopkeeper') out.shirt = C.PLASTER_L;
  return out;
}

// Note: a variant's outfit for other modules, such as a named character's look (camp/looks.js).
export const outfitFor = (variant) => OUTFIT[variant] || OUTFIT.man;

const faceNum = (v) => (v === 'n' ? null : Number(v));
// Note: a named character's face code (camp/looks.js faceCode) sets the skin, hair and attire, so the sprite matches the portrait.
function faceOutfit(base, code) {
  const [skin, hair, hat, band, hatStyle, coat, vest, bandana, shirt] = code.split('.');
  const out = { ...base, skin: faceNum(skin), hair: faceNum(hair), hat: faceNum(hat), band: faceNum(band) ?? base.band, hatStyle, coat: faceNum(coat), bandana: faceNum(bandana) };
  if (vest !== 'n') out.vest = faceNum(vest);
  if (shirt !== 'n') out.shirt = faceNum(shirt);
  return out;
}

function outfitOf(o) {
  const base = OUTFIT[o.variant] || OUTFIT[o.role] || OUTFIT.seasoned;
  if (o.face) return faceOutfit(base, o.face);
  if (o.role === 'hostile') return { ...base, ...LOOKS[(o.look | 0) % LOOKS.length] };
  return o.style > 0 && o.role === 'civilian' && STYLE[o.variant] ? styledOutfit(OUTFIT[o.variant] || base, o.variant, o.style) : base;
}

// Note: pose parts are small op lists in texels from the sprite centre; x runs forward, y to the actor's right.
const oL = (col, x0, y0, x1, y1, w = 1) => ['l', col, x0, y0, x1, y1, w];
const oR = (col, x, y, w = 1, h = 1) => ['r', col, x, y, w, h];
const oD = (col, x, y, r) => ['d', col, x, y, r];
const oG = (col, pts) => ['g', col, pts];

function runOps(B, ops) {
  for (const [t, col, a, b, c, d, e] of ops) {
    if (t === 'l') B.l(col, a, b, c, d, e);
    else if (t === 'r') B.r(col, a, b, c, d);
    else if (t === 'g') B.g(col, a);
    else B.e(col, a, b, c, c);
  }
}

// Note: the model whose part list the figure being drawn holds (item 364); ensurePerson sets it from the description, and a model of the wrong class falls back to the Winchester or the Colt.
let held = '';
const modelFor = (kind) => {
  const w = WEAPONS[held];
  return w && GUN_PARTS[held] && (w.kind === 'rifle') === (kind === 'rifle') ? held : kind === 'rifle' ? 'winchester73' : 'colt73';
};

// Note: a long gun from butt end to muzzle, drawn from its model's parts (gunart.js).
const rifleOps = (x0, y0, x1, y1) => gunOpsFor(modelFor('rifle'), x0, y0, x1, y1);

// Note: a handgun from grip end to muzzle, drawn from its model's parts (gunart.js).
const gunOps = (x0, y0, x1, y1) => gunOpsFor(modelFor('handgun'), x0, y0, x1, y1);

// Note: the weapon in both hands at the shoulder, dx pulls it back for recoil.
function aimed(o, k, lo, dx = 0) {
  const s = 7 * k;
  if (o.weapon === 'rifle') return { arms: [[8 + dx, -s, 16 + dx, lo - 1], [8 + dx, s, 26 + dx, lo + 1]], gun: rifleOps(10 + dx, lo, 38 + dx, lo) };
  if (o.weapon === 'handgun') return { arms: [[8 + dx, -s, 20 + dx, lo - 1], [8 + dx, s, 20 + dx, lo + 1]], gun: gunOps(19 + dx, lo, 29 + dx, lo) };
  return { arms: [[6, -8 * k, 11, -6 * k], [6, 8 * k, 11, 6 * k]], gun: [] };
}

// Note: the weapon in the left hand at the hip, the right hand free for a door, a fist or a signal.
function oneHanded(o, k, right) {
  const s = 7 * k;
  if (o.weapon === 'rifle') return { arms: [[8, -s, 20, -8], right], gun: rifleOps(8, -6, 34, -10) };
  if (o.weapon === 'handgun') return { arms: [[8, -s, 16, -6], right], gun: gunOps(15, -6, 25, -8) };
  return { arms: [[6, -8 * k, 11, -6 * k], right], gun: [] };
}

const CROUCHY = new Set(['search', 'lift', 'cower', 'carry']);
const WALK_DX = [0, 4, 0, -4];
const BOOT = (x, y) => oR(C.SHADOW, x, y, 3, 3);

// Note: item 499: hand positions and the bundle (centre and angle) per dynamite pose; 8 is the gun going to or coming from the holster.
const DYN_RIGHT = { 0: [-2, 10], 1: [10, 3], 2: [13, 3], 7: [13, 3], 3: [14, 2], 4: [-8, 11.5], 5: [21, 4], 6: [-2, 10], 8: [2, 10] };
const DYN_LEFT = { 0: [11, -6], 1: [11, -5], 2: [7, -7], 7: [11, -3], 3: [16, -1], 4: [20, -5], 5: [6, -9], 6: [11, -6], 8: [11, -6] };
const DYN_BUNDLE = { 1: [10, 3, 0.6], 2: [13, 3, -0.3], 7: [13, 3, -0.3], 3: [14, 2, -0.9], 4: [-8, 11.5, 2.3] };
const BUNDLE_LEN = 9;
// Note: where the fuse ends for a bundle pose, in art units ahead of and to the right of the body; the spark is drawn there.
export function bundleTip(ph) {
  const b = DYN_BUNDLE[ph];
  if (!b) return null;
  const r = BUNDLE_LEN / 2 + 3;
  return [b[0] + Math.cos(b[2]) * r, b[1] + Math.sin(b[2]) * r];
}
// Note: five red paper sticks tied in a bundle, seen from above as three, with a twine band and the fuse out of one end.
function bundleOps(cx, cy, ang) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const h = BUNDLE_LEN / 2;
  const ops = [oL(OUTLINE, cx - ux * h, cy - uy * h, cx + ux * h, cy + uy * h, 5.4)];
  for (const k of [-1.3, 0, 1.3]) {
    const ox = -uy * k;
    const oy = ux * k;
    ops.push(oL(C.RED, cx - ux * h + ox, cy - uy * h + oy, cx + ux * h + ox, cy + uy * h + oy, 1.4));
    ops.push(oL(C.RED_L, cx - ux * h + ox - uy * 0.3, cy - uy * h + oy + ux * 0.3, cx + ux * (h - 0.6) + ox - uy * 0.3, cy + uy * (h - 0.6) + oy + ux * 0.3, 0.4));
  }
  for (const t of [-0.25, 0.25]) ops.push(oL(C.SAND_L, cx + ux * h * t - uy * 2.4, cy + uy * h * t + ux * 2.4, cx + ux * h * t + uy * 2.4, cy + uy * h * t - ux * 2.4, 0.8));
  ops.push(oL(C.DARK, cx + ux * h, cy + uy * h, cx + ux * (h + 3), cy + uy * (h + 3) + 0.6, 0.7));
  return ops;
}

// Note: body language of the pace; sprint leans into the run with the weapon swinging low, creep is hunched with short toe steps and the weapon held tight.
function gaitPose(g, o, k, lo, ph) {
  const s = 7 * k;
  const sw = WALK_DX[ph] / 4;
  if (o.gait === 'sprint') {
    g.legs = [WALK_DX[ph] * 2.1, -WALK_DX[ph] * 2.1];
    g.tx = 3;
    g.hx = 3.5;
    g.hat = -2;
    g.torso = 1.16;
    if (o.weapon === 'rifle') {
      g.gun = rifleOps(5, -8 + sw * 2, 31, -13 + sw * 3);
      g.arms = [[8, -s, 17, -9 + sw * 2], [6, s, 7 + sw * 9, s + 7]];
    } else if (o.weapon === 'handgun') {
      g.gun = gunOps(14, -8 + sw, 24, -10 + sw * 2);
      g.arms = [[8, -s, 15, -8 + sw], [6, s, 7 + sw * 9, s + 7]];
    } else g.arms = [[6, -s, 7 - sw * 9, -s - 7], [6, s, 7 + sw * 9, s + 7]];
  } else if (o.gait === 'creep') {
    g.legs = [WALK_DX[ph] * 0.5, -WALK_DX[ph] * 0.5];
    g.tx = 2;
    g.hx = -1.5;
    g.torso = 0.9;
    g.toe = true;
    Object.assign(g, creepHold(o, s, lo));
  } else if (o.gait === 'hunch') {
    g.tx = 1;
    g.hx = -1;
    g.torso = 0.94;
    Object.assign(g, creepHold(o, s, lo));
  } else if (o.gait === 'ready') {
    g.legs = [3, -3];
    g.tx = 2;
    g.hx = 2;
    g.torso = 1.06;
  }
}

// Note: low-ready: the weapon close to the body, both hands tucked in.
function creepHold(o, s, lo) {
  if (o.weapon === 'rifle') return { arms: [[7, -s * 0.85, 14, lo], [7, s * 0.85, 21, lo + 3]], gun: rifleOps(6, lo + 1, 31, lo + 4) };
  if (o.weapon === 'handgun') return { arms: [[7, -s * 0.85, 14, lo - 1], [7, s * 0.85, 14, lo + 2]], gun: gunOps(12, lo, 22, lo + 1) };
  return { arms: [[6, -s * 0.8, 10, -4], [6, s * 0.8, 10, 4]], gun: [] };
}

// Note: holding a post: braced and a little low, the weapon raised at the shoulder toward the arc; the head and the muzzle swing together, o.sweep 0.8 texel steps to the right.
function watchPose(g, o, k, lo) {
  const s = 7 * k;
  const sw = (o.sweep | 0) * 0.8;
  g.legs = [4, -4];
  g.tx = 1;
  g.hx = 1.5;
  g.hy = sw;
  g.hat = 0.6;
  g.torso = 1.05;
  if (o.weapon === 'rifle') {
    g.arms = [[7, -s * 0.9, 15, lo - 1 + sw * 0.5], [7, s * 0.9, 25, lo + 1 + sw]];
    g.gun = rifleOps(7, lo + sw * 0.3, 37, lo + sw * 1.4);
  } else if (o.weapon === 'handgun') {
    g.arms = [[7, -s * 0.85, 17, lo - 1 + sw * 0.6], [7, s * 0.85, 18, lo + 1 + sw * 0.6]];
    g.gun = gunOps(16, lo + sw * 0.5, 26, lo + sw * 1.1);
  } else {
    g.arms = [[6, -s * 0.8, 10, -4], [6, s * 0.8, 10, 4]];
    g.gun = [];
  }
}

// Note: bent under the load; the hands hold the carried body's legs on one side and its arm on the other.
function carryPose(g, s, ph) {
  g.arms = [[4, -s, -3, -13], [4, s, -2, 11]];
  g.legs = [WALK_DX[ph] * 0.7, -WALK_DX[ph] * 0.7];
  g.hx = 4;
  g.tx = 1;
  g.torso = 0.88;
}

// Note: a hand in ops, in three passes (outlines, then fingers and thumb, then the palm) so every part has one clean dark edge; a is the way the fingers point in radians, reach their length, spread the fan between neighbours, curl the share of the length folded away, and thumb is 'out', 'tucked' or 'up'.
function handOps(skin, x, y, a, o = {}) {
  const reach = o.reach ?? 4.4;
  const spread = o.spread ?? 0.2;
  const curl = o.curl ?? 0;
  const r = o.r ?? 2.5;
  const shade = o.shade ? tone(skin, o.shade) : skin;
  // Note: the body is on the side the sleeve comes from, so the thumb sits there; y grows to the actor's right.
  const side = y > 0 ? -1 : 1;
  const dir = (t) => [Math.cos(t), Math.sin(t)];
  const tip = (t, len) => [x + dir(t)[0] * (r * 0.5 + len), y + dir(t)[1] * (r * 0.5 + len)];
  const fingers = (o.only ?? [-1.5, -0.5, 0.5, 1.5]).map((f) => {
    const t = a + f * spread;
    const len = reach * (1 - curl) * (1 - Math.abs(f) * 0.07);
    return [t, len, tip(t, len)];
  });
  const thumbAt = a + side * (o.thumb === 'up' ? 1.5 : o.thumb === 'tucked' ? 0.55 : 1.0);
  const thumbLen = o.thumb === 'tucked' ? 1.4 : 2.6;
  const thumb = [thumbAt, thumbLen, [x + dir(thumbAt)[0] * (r * 0.6 + thumbLen), y + dir(thumbAt)[1] * (r * 0.6 + thumbLen)]];
  const digits = o.joined ? [thumb] : [...fingers, thumb];
  const ops = [];
  // Note: a flat hand keeps its fingers together as one slab with fine lines between them, which reads better than four touching strokes.
  const slab = (grow, col) => {
    const [dx, dy] = dir(a);
    const px = -dy;
    const py = dx;
    const w = r * 0.95 + grow;
    const tw = r * 0.85 + grow;
    const b = [x + dx * r * 0.3, y + dy * r * 0.3];
    const t = [x + dx * (r * 0.5 + reach + grow), y + dy * (r * 0.5 + reach + grow)];
    return oG(col, [[b[0] + px * w, b[1] + py * w], [t[0] + px * tw, t[1] + py * tw], [t[0] - px * tw, t[1] - py * tw], [b[0] - px * w, b[1] - py * w]]);
  };
  if (o.joined) ops.push(slab(0.9, C.DARK));
  for (const [t, len, p] of digits) ops.push(oL(C.DARK, x + dir(t)[0] * r * 0.4, y + dir(t)[1] * r * 0.4, p[0], p[1], 2));
  ops.push(oD(C.DARK, x, y, r + 0.9));
  for (const [t, len, p] of digits) ops.push(oL(shade, x + dir(t)[0] * r * 0.4, y + dir(t)[1] * r * 0.4, p[0], p[1], 1.1));
  if (o.joined) {
    ops.push(slab(0, shade));
    for (const f of [-0.5, 0.5]) {
      const [dx, dy] = dir(a);
      const c = r * 0.85 * f;
      ops.push(oL(tone(skin, -0.3), x + dx * (r * 0.5 + reach * 0.45) - dy * c, y + dy * (r * 0.5 + reach * 0.45) + dx * c, x + dx * (r * 0.5 + reach) - dy * c, y + dy * (r * 0.5 + reach) + dx * c, 0.5));
    }
  }
  ops.push(oD(shade, x, y, r), oD(tone(skin, 0.12), x - dir(a)[0] * 0.5 - dir(a)[1] * side * 0.6, y - dir(a)[1] * 0.5 + dir(a)[0] * side * 0.6, r * 0.45));
  // Note: knuckle marks where the fingers leave the palm.
  for (const [t] of fingers) ops.push(oD(tone(skin, -0.28), x + dir(t)[0] * r * 0.85, y + dir(t)[1] * r * 0.85, 0.35));
  return ops;
}

// Note: where an arm that reaches (x, y) ends, so the gesture hand can sit exactly over the plain fist the arm already carries.
const wristOf = (s, x, y) => {
  const ax = x - 8;
  const ay = y - s;
  const al = Math.hypot(ax, ay) || 1;
  return [x + (ax / al) * 0.9, y + (ay / al) * 0.9];
};

// Note: an open hand raised flat beside the head, palm out with the fingers spread; the second beat presses the air down a little.
function quietHand(g, o, k, s, beat) {
  const y = 11.8 - beat * 1.4;
  const x = 7.5 + beat;
  Object.assign(g, oneHanded(o, k, [8, s, x, y]));
  const [hx, hy] = wristOf(s, x, y);
  g.extra.push(...handOps(o.skinCol, hx, hy, -0.12 + beat * 0.12, { reach: 4.6, spread: 0.42, thumb: 'out' }));
}

// Note: the hold order: a flat palm held out, fingers together and forward, pressed down twice; the second beat is the press, so the palm darkens and the fingers shorten.
function holdHand(g, o, k, s, beat) {
  const x = 19.5 - beat * 1.2;
  const y = 9.5;
  Object.assign(g, oneHanded(o, k, [8, s, x - 1, y]));
  const [hx, hy] = wristOf(s, x - 1, y);
  g.extra.push(...handOps(o.skinCol, hx + 0.8, hy, 0, { reach: beat ? 3.6 : 4.8, joined: true, r: beat ? 2.7 : 2.9, thumb: 'tucked', shade: beat ? -0.12 : 0 }));
}

// Note: the cover order: a fist raised beside the head and pumped once; the second beat is the pump, so the fist rises, tightens and darkens.
function coverHand(g, o, k, s, beat) {
  const x = 13 + beat * 1.5;
  const y = 10.5 - beat * 1.8;
  Object.assign(g, oneHanded(o, k, [8, s, x, y]));
  const [hx, hy] = wristOf(s, x, y);
  g.extra.push(...handOps(o.skinCol, hx, hy, -0.05, { reach: 2.6, spread: 0.32, curl: 0.35, r: beat ? 2.7 : 3, thumb: 'tucked', shade: beat ? -0.12 : 0 }));
}

// Note: the fall-back order: a flat hand held out to the side, fingers together pointing out, swept outward and back; a faint streak shows where it came from.
function fallbackHand(g, o, k, s, beat) {
  const x = 16;
  const y = beat ? 11 : 3.5;
  Object.assign(g, oneHanded(o, k, [8, s, x, y - 2.5]));
  const [hx, hy] = wristOf(s, x, y - 2.5);
  g.extra.push(oL('rgba(10,8,6,0.25)', x, beat ? 3.5 : 11, x, y, 1.2), ...handOps(o.skinCol, hx, hy + 0.6, Math.PI / 2, { reach: 4.8, joined: true, thumb: 'out' }));
}

// Note: a hand cupped at the mouth like a horn; the second beat opens it wider and leans the head in.
function cupHand(g, o, k, s, beat) {
  Object.assign(g, oneHanded(o, k, [8, s, 12, 4.6]));
  const [hx, hy] = wristOf(s, 12, 4.6);
  g.extra.push(...handOps(o.skinCol, hx, hy, -0.2, { reach: 4.2, spread: beat ? 0.26 : 0.14, curl: 0.12, thumb: 'up' }));
  g.hx = beat ? 1.5 : 0;
}

// Note: moves every op of a weapon, so a hit can pull it off the aim line.
function shiftOps(ops, dx, dy) {
  return ops.map(([t, col, a, b, c, d, e]) => {
    if (t === 'l') return ['l', col, a + dx, b + dy, c + dx, d + dy, e];
    if (t === 'r') return ['r', col, a + dx, b + dy, c, d];
    if (t === 'g') return ['g', col, a.map(([x, y]) => [x + dx, y + dy])];
    return [t, col, a + dx, b + dy, c, d, e];
  });
}

// Note: protective wound responses: clutch the arm or torso, double over, lose a step or buckle a knee.
function hitPose(g, o, k, s) {
  const h = o.hit;
  if (h === 'armL' || h === 'armR') {
    const i = h === 'armL' ? 0 : 1;
    const sgn = i ? 1 : -1;
    const a = g.arms[i];
    g.arms = g.arms.map((r, j) => (j === i ? [a[0], a[1], 3, sgn * 4.5] : [r[0], r[1], r[2] - 2, r[3] + sgn * 3]));
    g.gun = shiftOps(g.gun, -2, sgn * 3);
  } else if (h === 'legL' || h === 'legR') {
    const i = h === 'legL' ? 0 : 1;
    g.legs = g.legs.map((l, j) => (l === null ? l : j === i ? -6 : 3));
    g.tx -= 1.5;
  } else if (h === 'chest') {
    g.tx += 1.5;
    g.hx += 2.5;
    g.legs = [-3, 2];
    g.arms = [[4, -s, 5, -1], [4, s, 7, 2]];
    g.gun = shiftOps(g.gun, -3, 3);
  } else if (h === 'belly') {
    g.tx += 3;
    g.hx += 4.5;
    g.arms = [[4, -s * 0.8, 7, -1.5], [4, s * 0.8, 7, 1.5]];
    g.gun = o.weapon === 'rifle' ? rifleOps(2, 8, 28, 12) : o.weapon === 'handgun' ? gunOps(8, 7, 16, 9) : [];
  } else if (h === 'snap') {
    g.hx -= 3.4;
    g.hat -= 2.6;
  }
}

// Note: returns legs (a null foot is drawn by the pose), body shift, head shift, arms, weapon and extra ops.
function geometry(o, k, lo) {
  const s = 7 * k;
  const g = { legs: [0, 0], tx: 0, hx: 0, hy: 0, hat: 0, torso: 1, toe: false, extra: [], ...aimed(o, k, lo, 0) };
  const ph = o.ph | 0;
  switch (o.act) {
    case 'walk':
      g.legs = [WALK_DX[ph], -WALK_DX[ph]];
      gaitPose(g, o, k, lo, ph);
      break;
    case 'recoil':
      Object.assign(g, aimed(o, k, lo, -3));
      g.hx = -1;
      break;
    case 'click':
      Object.assign(g, aimed(o, k, lo, -1));
      break;
    case 'lever': {
      const h = [[16, lo - 4], [18, lo - 6], [15, lo - 3]][ph];
      g.arms[0] = [8, -s, h[0], h[1]];
      g.extra.push(oL(C.IRON_L, 12, lo - 1, h[0], h[1]));
      break;
    }
    case 'cock':
      g.extra.push(oR(C.IRON_L, 18, lo - 2, 2, 1));
      break;
    case 'reload':
      if (o.weapon === 'rifle') {
        const p = [[5, 10], [12, 6], [16, 3], [12, 7]][ph % 4];
        g.gun = rifleOps(8, 4, 34, -5);
        g.arms = [[8, -s, 24, -3], [8, s, p[0], p[1]]];
        g.tx = -1;
        if (ph % 4 < 3) g.extra.push(oR(C.GOLD_L, p[0] + 1, p[1] - 1, 2, 1));
      } else if (o.weapon === 'handgun') {
        g.gun = gunOps(11, 3, 21, -2);
        g.tx = -1;
        const p = [[5, 10], [11, 7], [15, 3], [10, 8], [14, 4], [18, 3], [10, 9], [6, 10]][ph];
        g.arms = [[8, -s, 15, 0], [8, s, p[0], p[1]]];
        if (ph < 3) g.extra.push(oR(C.GOLD_L, p[0] + 1, p[1] - 1, 2, 1));
        else if (ph === 4) g.extra.push(oR(C.GOLD_L, 13, 2, 2, 1));
        else if (ph === 5) g.extra.push(oL(C.IRON_L, 12, 2, 18, 3));
        else if (ph === 6) g.extra.push(oR(C.GOLD_L, 9, 10, 2, 1), oR(C.GOLD_L, 12, 12, 1, 1));
        else if (ph === 7) g.extra.push(oR(C.GOLD_L, 7, 9, 2, 1));
      }
      break;
    case 'switch':
      if (ph === 0) {
        g.arms = [[8, -s, 12, -4], [8, s, 14, 6]];
        g.gun = o.weapon === 'rifle' ? rifleOps(8, 6, 30, 10) : o.weapon === 'handgun' ? gunOps(10, 7, 18, 9) : [];
      } else if (ph === 1) {
        g.arms = [[4, -s, 3, -3], [4, s, 2, 8]];
        g.gun = [];
      } else Object.assign(g, aimed(o, k, lo, -4));
      break;
    case 'knife': {
      const handX = ph ? 22 : 15, handY = ph ? 3 : 7;
      g.gun = [];
      g.arms = [[8, -s, 12, -4], [8, s, handX, handY]];
      g.extra.push(oL(C.DARK, handX - 1, handY, handX + 3, handY, 2.5), oL(C.IRON_L, handX + 3, handY, handX + 10, handY - 1, 1.5));
      g.tx = ph ? 2 : -1;
      break;
    }
    case 'dyn': {
      // Note: item 499: the dynamite throw; the right hand holds the bundle at the points of HOLD in js/dynamite.js (32 art units to the metre).
      const R = DYN_RIGHT[ph];
      const L = DYN_LEFT[ph];
      g.gun = ph === 8 ? (o.weapon === 'rifle' ? rifleOps(4, 8, 28, 12) : o.weapon === 'handgun' ? gunOps(4, 9, 12, 11) : []) : [];
      g.arms = [[8, -s, L[0], L[1]], [8, s, R[0], R[1]]];
      g.tx = ph === 4 ? -1.5 : ph === 5 ? 2 : 0;
      const b = DYN_BUNDLE[ph];
      if (b) g.extra.push(...bundleOps(b[0], b[1], b[2]));
      if (ph === 2) g.extra.push(oL(C.WOOD_L, L[0] - 1, L[1], L[0] + 3, L[1] + 1, 0.9), oD(C.RED_D, L[0] + 3.4, L[1] + 1.1, 0.9));
      if (ph === 7 || ph === 3) {
        const m = ph === 7 ? [L[0] + 3, L[1] + 1] : [L[0] + 1.5, L[1] + 2];
        g.extra.push(oL(C.WOOD_L, L[0] - 1, L[1], m[0], m[1], 0.9), oD(C.GOLD, m[0] + 0.6, m[1], 2.2), oD(C.GOLD_L, m[0] + 0.6, m[1], 1.4), oD(C.BONE, m[0] + 0.6, m[1], 0.7));
      }
      break;
    }
    case 'reach': {
      Object.assign(g, oneHanded(o, k, [8, s, ph ? 24 : 20, ph ? 2 : 4]));
      g.tx = ph;
      break;
    }
    case 'kick': {
      Object.assign(g, oneHanded(o, k, [8, s, 3, 11]));
      g.legs = [0, null];
      const leg = [[-8, 8], [9, 6], [18, 4], [4, 5]][ph];
      g.extra.push(oL(C.DARK, 0, 5, leg[0], leg[1], 3), BOOT(leg[0] - 1, leg[1] - 1));
      g.tx = [-2, -1, 2, 0][ph];
      break;
    }
    case 'smash': {
      const f = [[0, 9, -20, 14], [10, 4, -12, 12], [22, 0, 0, 8], [14, 2, -8, 10]][ph];
      g.gun = o.weapon === 'handgun' ? gunOps(f[0], f[1], f[0] - 8, f[1] + 3) : o.weapon === 'rifle' ? rifleOps(f[0], f[1], f[2], f[3]) : [];
      g.arms = [[8, -s, f[0] - 6, f[1] - 2], [8, s, Math.max(f[0] - 14, -4), f[1] + 2]];
      g.tx = [-2, 0, 2, 0][ph];
      break;
    }
    case 'vault':
      g.gun = [];
      if (ph === 0) {
        g.tx = 3;
        g.arms = [[8, -s, 18, -5], [8, s, 18, 5]];
        g.legs = [0, null];
        g.extra.push(oL(C.DARK, 0, 5, 10, 7, 3), BOOT(10, 6));
      } else if (ph === 1) {
        g.arms = [[8, -s, 20, -4], [8, s, 20, 4]];
        g.legs = [null, null];
        g.extra.push(oL(C.DARK, 0, -4, -12, -6, 3), BOOT(-14, -7), oL(C.DARK, 0, 4, 10, 6, 3), BOOT(10, 5));
      } else {
        g.arms = [[6, -s, 12, -12], [6, s, 12, 12]];
        g.legs = [3, 3];
      }
      break;
    case 'search':
      g.arms = ph ? [[8, -s, 19, -5], [8, s, 14, 3]] : [[8, -s, 14, -3], [8, s, 19, 5]];
      g.gun = [];
      g.hx = 2;
      break;
    case 'lift':
      g.gun = [];
      if (o.load) {
        carryPose(g, s, 0);
        break;
      }
      g.arms = ph ? [[8, -s, 14, -1], [8, s, 14, 1]] : [[8, -s, 20, -3], [8, s, 20, 3]];
      g.hx = ph ? 2 : 1;
      g.tx = ph ? 2 : 0;
      break;
    case 'carry':
      g.gun = [];
      carryPose(g, s, ph);
      break;
    case 'signal': {
      if (ph >= 5) {
        // Note: phases 5 and 6 are the quiet hand, 7 and 8 the hand cupped at the mouth, 9 and 10 the flat palm pressed down, 11 and 12 the raised fist, 13 and 14 the flat hand swept out; each pair is two beats of one gesture.
        if (ph <= 6) quietHand(g, o, k, s, ph - 5);
        else if (ph <= 8) cupHand(g, o, k, s, ph - 7);
        else if (ph <= 10) holdHand(g, o, k, s, ph - 9);
        else if (ph <= 12) coverHand(g, o, k, s, ph - 11);
        else fallbackHand(g, o, k, s, ph - 13);
        break;
      }
      // Note: phase 0 is the arm out with a finger pointing at the hostile; 3 and 4 are a flat palm swung left and right, the refusal.
      const hand = ph >= 3 ? [[18, 6], [18, -2]][ph - 3] : [19, 10];
      Object.assign(g, oneHanded(o, k, [8, s, hand[0], hand[1]]));
      const [hx, hy] = wristOf(s, hand[0], hand[1]);
      // Note: the finger is one long digit with the others folded; the refusal is a flat palm tilted to the side it is swung to.
      g.extra.push(...(ph === 0
        ? handOps(o.skinCol, hx, hy, 0.18, { only: [0], reach: 5.2, thumb: 'up', r: 2.4 })
        : handOps(o.skinCol, hx, hy, ph === 3 ? 0.35 : -0.35, { reach: 4.4, joined: true, thumb: 'tucked' })));
      break;
    }
    case 'shout':
      cupHand(g, o, k, s, 0);
      break;
    case 'handsUp':
      g.gun = [];
      g.arms = [[-3, -6, -12, -12], [-3, 6, -12, 12]];
      break;
    case 'cower':
      g.gun = [];
      g.arms = [[3, -6, 2, -3], [3, 6, 2, 3]];
      g.hx = -1;
      g.tx = ph;
      break;
    case 'doze':
      g.arms = [[6, -6, 10, -1], [6, 6, 10, 1]];
      g.gun = o.weapon === 'rifle' ? rifleOps(4, 5, 30, 8) : o.weapon === 'handgun' ? gunOps(10, 5, 18, 6) : [];
      g.hx = 3;
      break;
    default:
      if (o.gait === 'hunch' || o.gait === 'ready') gaitPose(g, o, k, lo, 0);
      else if (o.gait === 'watch') watchPose(g, o, k, lo);
      break;
  }
  if (o.hit) hitPose(g, o, k, s);
  // Note: a nod dips the head and hat forward; a shake turns it to one side and the other.
  if (o.nod === 1) {
    g.hx += 2.6;
    g.hat += 1.4;
  } else if (o.nod >= 2) g.hy += o.nod === 2 ? -2.4 : 2.4;
  if (o.stow === 'rifle') g.extra.push(oL(C.WOOD, -7, -8, 3, 8, 2), oR(C.IRON_L, 3, 8, 1, 1));
  else if (o.stow === 'handgun') g.extra.push(oR(C.DARK, 1, 8, 4, 3), oR(C.WOOD_D, 4, 9, 1, 1));
  return g;
}

function star(B, x, y, r, col) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  B.g(OUTLINE, pts.map(([px, py]) => [px, py]));
  B.g(col, pts.map(([px, py]) => [x + (px - x) * 0.82, y + (py - y) * 0.82]));
  B.r(C.BONE, x - r * 0.3, y - r * 0.5, 0.8, 0.8);
}

function drawHat(B, col, hx, hy, k, dx) {
  const st = col.hatStyle || 'round';
  if (st === 'cap') {
    B.e(OUTLINE, hx + dx, hy, 6.4 * k, 6.2 * k);
    B.e(col.hat, hx + dx, hy, 5.6 * k, 5.4 * k);
    B.e(tone(col.hat, 0.12), hx + dx - 0.6, hy - 1.2, 2.6 * k, 1.8 * k);
    B.l(tone(col.hat, -0.35), hx + dx - 4 * k, hy, hx + dx + 4 * k, hy, 0.8);
    if (FINE) for (const sy of [-3.2, 3.2]) B.l(tone(col.hat, -0.3), hx + dx - 3 * k, hy + sy * k, hx + dx + 1.5 * k, hy + sy * 0.4 * k, 0.6);
    B.e(tone(col.hat, -0.15), hx + dx + 5 * k, hy, 2.4 * k, 4.4 * k);
    if (FINE) {
      B.l(tone(col.hat, 0.2), hx + dx + 6.6 * k, hy - 3 * k, hx + dx + 6.6 * k, hy + 3 * k, 0.6);
      B.e(tone(col.hat, 0.25), hx + dx - 0.4, hy, 0.9);
    }
    return;
  }
  const br = { wide: 8.4, round: 7.4, pinched: 7.6, flat: 8, bowler: 6.3, sombrero: 10.6, bonnet: 5.8 }[st] * k;
  const cr = { wide: 4.3, round: 4.4, pinched: 4.1, flat: 5, bowler: 4.9, sombrero: 3.7, bonnet: 3.6 }[st] * k;
  const x = hx + dx;
  B.e('rgba(10,8,6,0.36)', x + 1.2, hy + 1.6, br, br * 0.97);
  B.e(OUTLINE, x, hy, br + 0.8, br * 0.96 + 0.8);
  B.e(tone(col.hat, -0.24), x, hy, br, br * 0.96);
  B.e(tone(col.hat, -0.1), x + 0.2, hy, br - 0.8, br * 0.96 - 0.8);
  B.e(col.hat, x + 0.4, hy - 0.2, br - 1.5, br * 0.96 - 1.5);
  if (FINE) B.e(tone(col.hat, 0.07), x + 0.6, hy - 0.3, br - 3, br * 0.96 - 3);
  // Note: a sombrero's brim has a braided edge, and a bonnet's a ribbon tied at the back.
  if (st === 'sombrero') {
    B.e(col.band, x + 0.4, hy - 0.2, br - 1.3, br * 0.96 - 1.3);
    B.e(tone(col.hat, -0.06), x + 0.4, hy - 0.2, br - 2.3, br * 0.96 - 2.3);
  }
  if (st === 'bonnet') B.g(col.band, [[x - cr, hy - 1], [x - br - 3.2, hy - 3.4], [x - br - 3.6, hy - 0.4], [x - cr, hy + 0.2], [x - br - 3.6, hy + 2.2], [x - br - 3.2, hy + 4.2], [x - cr, hy + 1]]);
  B.e(tone(col.hat, 0.1), x + 1.2, hy - 1.8, br * 0.5, br * 0.3);
  if (FINE && st === 'wide') for (const sy of [-1, 1]) B.e(tone(col.hat, -0.3), x + 0.4, hy + sy * (br * 0.96 - 1.8), br * 0.45, 0.8);
  if (FINE) B.e(tone(col.hat, -0.3), x + 0.8, hy + 0.3, cr + 2.2, cr * 0.97 + 2.2);
  B.e(OUTLINE, x + 0.4, hy, cr + 1.3, cr * 0.97 + 1.3);
  B.e(col.band, x + 0.4, hy, cr + 0.9, cr * 0.97 + 0.9);
  B.e(col.hat, x + 0.8, hy, cr, cr * 0.97);
  B.e(tone(col.hat, 0.15), x - 0.3, hy - 1.5, cr * 0.5, cr * 0.32);
  if (FINE) {
    B.e(tone(col.hat, 0.08), x + 0.6, hy - cr * 0.5, cr * 0.6, cr * 0.28);
    B.e(tone(col.hat, -0.08), x + 0.6, hy + cr * 0.5, cr * 0.6, cr * 0.26);
  }
  B.l(tone(col.hat, -0.4), x - cr * 0.8, hy, x + cr * 0.7, hy, 0.9);
  if (FINE) B.l(tone(col.band, 0.2), x + 0.4 - cr * 0.2, hy - cr * 1.02 - 0.3, x + 0.4 + cr * 0.7, hy - cr * 0.7, 0.5);
  if (st === 'pinched') {
    B.e(tone(col.hat, -0.4), x + cr * 0.65, hy - cr * 0.5, 0.9, 0.7);
    B.e(tone(col.hat, -0.4), x + cr * 0.65, hy + cr * 0.5, 0.9, 0.7);
  }
  if (st === 'flat') B.e(tone(col.hat, 0.1), x + 0.8, hy, cr * 0.8, cr * 0.76);
}

function drawHead(B, col, o, hx, hy, k, hatDx) {
  B.e(OUTLINE, hx + 0.6, hy, 5.8 * k, 5.8 * k);
  B.e(col.skin, hx + 0.6, hy, 5 * k, 5 * k);
  B.e(tone(col.skin, -0.25), hx, hy - 5 * k, 1.1, 1.5);
  B.e(tone(col.skin, -0.25), hx, hy + 5 * k, 1.1, 1.5);
  B.e(tone(col.skin, 0.12), hx + 5.2 * k, hy, 1.2, 1);
  if (col.hat == null || col.hatStyle === 'visor') {
    B.e(col.hair, hx - 0.8, hy, 5.6 * k, 5.6 * k);
    B.e(tone(col.hair, 0.18), hx - 1.6, hy - 1.6, 2.6 * k, 1.8 * k);
    B.e(OUTLINE, hx - 6.2 * k, hy, 3 * k, 3 * k);
    B.e(col.hair, hx - 6 * k, hy, 2.6 * k, 2.6 * k);
    if (FINE) {
      B.l(tone(col.hair, -0.45), hx - 5 * k, hy, hx + 3 * k, hy, 0.6);
      if (col.hat == null || col.ribbon != null) B.r(col.ribbon ?? C.RED_L, hx - 4 * k, hy - 1.6, 1.2, 3.2);
    }
    B.l(tone(col.hair, -0.3), hx - 4 * k, hy - 2.4, hx + 2 * k, hy - 3.2, 0.8);
    B.l(tone(col.hair, -0.3), hx - 4 * k, hy + 2.4, hx + 2 * k, hy + 3.2, 0.8);
    // Note: a clerk's green eyeshade sits over the brow with its band round the head; a dancer's plume curls from the back of her hair.
    if (col.hatStyle === 'visor') {
      B.g(OUTLINE, [[hx - 0.2, hy - 5.8 * k - 0.8], [hx + 3 * k, hy - 6.4 * k - 0.8], [hx + 7.2 * k + 0.8, hy - 3.4 * k], [hx + 7.8 * k + 0.8, hy], [hx + 7.2 * k + 0.8, hy + 3.4 * k], [hx + 3 * k, hy + 6.4 * k + 0.8], [hx - 0.2, hy + 5.8 * k + 0.8]]);
      B.g(col.hat, [[hx, hy - 5.6 * k], [hx + 3 * k, hy - 6 * k], [hx + 7 * k, hy - 3.2 * k], [hx + 7.6 * k, hy], [hx + 7 * k, hy + 3.2 * k], [hx + 3 * k, hy + 6 * k], [hx, hy + 5.6 * k]]);
      B.e(tone(col.hat, 0.22), hx + 4.2 * k, hy - 1.6, 2.4 * k, 1.4);
      B.l(col.band, hx - 0.4, hy - 5.8 * k, hx - 0.4, hy + 5.8 * k, 0.9);
    }
  } else {
    if (col.bun) B.e(col.hair, hx - 6.4 * k, hy, 3 * k, 3 * k);
    drawHat(B, col, hx, hy, k, hatDx);
  }
  if (col.plume != null) {
    B.l(OUTLINE, hx - 2 * k, hy - 3 * k, hx - 9 * k, hy - 8 * k, 2.4);
    B.l(col.plume, hx - 2 * k, hy - 3 * k, hx - 9 * k, hy - 8 * k, 1.5);
    B.l(tone(col.plume, -0.3), hx - 4 * k, hy - 4.2 * k, hx - 8 * k, hy - 5.4 * k, 0.6);
  }
}

function drawBandana(B, col, hx, hy, k, gait) {
  if (!col.bandana) return;
  const t = gait === 'sprint' ? 1.5 : 1;
  const bx = hx - 5.4 * k;
  B.g(OUTLINE, [[bx + 1, hy - 1.8], [bx - 7 * t - 1, hy - 4.4], [bx - 6 * t - 1, hy + 0.6]]);
  B.g(col.bandana, [[bx + 1, hy - 1.4], [bx - 6.4 * t, hy - 3.8], [bx - 5.4 * t, hy + 0.2]]);
  B.g(OUTLINE, [[bx + 1, hy + 1.8], [bx - 6 * t - 1, hy + 4.8], [bx - 4 * t - 1, hy + 0.4]]);
  B.g(tone(col.bandana, -0.2), [[bx + 1, hy + 1.4], [bx - 5.4 * t, hy + 4.2], [bx - 3.6 * t, hy + 0.6]]);
  B.e(col.bandana, bx + 1, hy, 2.2, 2.2);
}

function drawStanding(ctx, o, col) {
  const B = brush(ctx);
  const gait = o.gait || '';
  const S = o.act === 'cower' ? 0.78 : o.act === 'carry' ? 0.9 : o.stance === 'crouch' || CROUCHY.has(o.act) ? 0.86 : gait === 'creep' || o.hit === 'legL' || o.hit === 'legR' ? 0.92 : gait === 'watch' ? 0.9 : gait === 'hunch' ? 0.95 : 1;
  const lo = Math.round(o.lean * 13);
  const boy = o.variant === 'boy' ? 0.82 : 1;
  const k = S * boy * (col.size || 1);
  // Note: ty moves the torso and U draws the arms, gun and head with it; geometry gets the head's offset from the shoulders, so the aimed gun still ends up at lo.
  const ty = lo * LEAN_BODY;
  const U = shifted(B, ty);
  const g = geometry({ ...o, skinCol: col.skin }, k, lo - ty);
  // Note: the arm roots sit ahead of the chest, where the hat hides them; in a lean the hat moves aside, so they go back onto the shoulders.
  if (lo) g.arms = g.arms.map(([x0, y0, x1, y1]) => [Math.min(x0, LEAN_SHOULDER), y0, x1, y1]);
  // Note: the torso sits a little behind the head, so the shoulders show out from under the hat.
  const tx = g.tx - 1.5;
  const pants = col.pants ?? C.DARK;
  B.e('rgba(10,8,6,0.26)', 1.8, 2.6 + ty * 0.5, 10 * k, 13 * k + Math.abs(ty) * 0.5);
  B.e('rgba(10,8,6,0.3)', 1.2, 2 + ty * 0.5, 8 * k, 11 * k + Math.abs(ty) * 0.5);
  // Note: legs and boots.
  g.legs.forEach((lx, i) => {
    if (lx === null) return;
    const y = (i ? 5 : -5) * k;
    const bw = g.toe ? 4.2 : 5.6;
    B.l(OUTLINE, -1 * k, y, -8 * k + lx + 3, y, 4.6);
    B.l(pants, -1 * k, y, -8 * k + lx + 3, y, 3.4);
    B.r(OUTLINE, -8 * k + lx - 0.6, y - 2.4, bw + 1.2, 4.8);
    B.r(C.DARK, -8 * k + lx, y - 1.8, bw, 3.6);
    B.r(C.WOOD_D, -8 * k + lx + 1, y - 1.8, bw - 1, 0.9);
    B.r(C.SHADOW, -8 * k + lx, y - 1.8, 1.3, 3.6);
  });
  // Note: in a lean the hips stay over the feet and the waist runs from them up to the shifted torso.
  if (lo) {
    B.l(OUTLINE, tx - 2 * k, 0, tx - 1 * k, ty, 9.6 * k);
    B.l(pants, tx - 2 * k, 0, tx - 1 * k, ty, 8 * k);
  }
  if (col.duster) {
    U.g(OUTLINE, [[tx - 4 * k, -7 * k - 0.8], [tx - 14 * k - 0.8, -5.4 * k], [tx - 15 * k - 0.8, 0], [tx - 14 * k - 0.8, 5.4 * k], [tx - 4 * k, 7 * k + 0.8]]);
    U.g(tone(col.coat, -0.1), [[tx - 4 * k, -7 * k], [tx - 14 * k, -5 * k], [tx - 15 * k, 0], [tx - 14 * k, 5 * k], [tx - 4 * k, 7 * k]]);
    U.l(tone(col.coat, -0.4), tx - 6 * k, 0, tx - 15 * k, 0, 0.9);
  }
  // Note: a bustle skirt: a bell behind the waist with a bow at the back, in the colour of the dress; only the saloon's women wear one.
  if (col.skirt != null) {
    const cx = -6 * k + (g.legs[0] || 0) * 0.3;
    B.e(OUTLINE, cx, 0, 10.2 * k + 0.9, 11.4 * k + 0.9);
    B.e(tone(col.skirt, -0.14), cx, 0, 10.2 * k, 11.4 * k);
    B.e(col.skirt, cx + 0.8, 0, 8.8 * k, 10.2 * k);
    B.e(tone(col.skirt, 0.14), cx + 2, -2 * k, 5 * k, 5.6 * k);
    for (const t of [-8, -4, 0, 4, 8]) B.l(tone(col.skirt, -0.3), -2 * k, t * 0.35 * k, cx - 8.2 * k, t * 1.05 * k, 0.6);
    B.e(OUTLINE, cx - 9 * k, 0, 3.6 * k + 0.7, 4.6 * k + 0.7);
    B.e(tone(col.skirt, 0.2), cx - 9 * k, 0, 3.6 * k, 4.6 * k);
    B.e(tone(col.skirt, -0.25), cx - 8.6 * k, 0, 1.6 * k, 2.4 * k);
  }
  // Note: arms: a sleeve with a dark edge, a shirt cuff and a hand with a thumb.
  for (const [x0, y0, x1, y1] of g.arms) U.l(OUTLINE, x0 + tx, y0, x1, y1, 4.4);
  for (const [x0, y0, x1, y1] of g.arms) {
    U.l(col.coat, x0 + tx, y0, x1, y1, 3.1);
    U.l(tone(col.coat, 0.14), x0 + tx, y0 - 0.5, x1, y1 - 0.5, 0.8);
    U.l(col.shirt, x1 - (x1 - x0 - tx) * 0.13, y1 - (y1 - y0) * 0.13, x1, y1, 2.8);
    const ax = x1 - x0 - tx;
    const ay = y1 - y0;
    const al = Math.hypot(ax, ay) || 1;
    const cx = x1 - ax * 0.15;
    const cy = y1 - ay * 0.15;
    U.l(tone(col.shirt, -0.35), cx - (ay / al) * 1.4, cy + (ax / al) * 1.4, cx + (ay / al) * 1.4, cy - (ax / al) * 1.4, 0.6);
    if (col.garters != null) {
      const gx = x0 + tx + ax * 0.5;
      const gy = y0 + ay * 0.5;
      U.l(col.garters, gx - (ay / al) * 2, gy + (ax / al) * 2, gx + (ay / al) * 2, gy - (ax / al) * 2, 1.1);
    }
    if (FINE) for (const t of [0.42, 0.55]) {
      const mx = x0 + tx + ax * t;
      const my = y0 + ay * t;
      U.l(tone(col.coat, -0.38), mx - (ay / al) * 1.3, my + (ax / al) * 1.3, mx + (ay / al) * 1.3, my - (ax / al) * 1.3, 0.6);
    }
  }
  // Note: a hand is a small fist just past the cuff, pointing along the arm, with a thumb on the side that faces the body and a shadow under the knuckles.
  for (const [x0, y0, x1, y1] of g.arms) {
    const ux = x1 - x0 - tx;
    const uy = y1 - y0;
    const ul = Math.hypot(ux, uy) || 1;
    const hx = x1 + (ux / ul) * 0.9;
    const hy = y1 + (uy / ul) * 0.9;
    const side = y1 > 0 ? -1 : 1;
    const nx = -(uy / ul) * side;
    const ny = (ux / ul) * side;
    U.e(OUTLINE, hx, hy, 2.1);
    U.e(OUTLINE, hx + nx * 1.5 + (ux / ul) * 0.6, hy + ny * 1.5 + (uy / ul) * 0.6, 1.3);
    U.e(col.skin, hx, hy, 1.5);
    U.e(col.skin, hx + nx * 1.5 + (ux / ul) * 0.6, hy + ny * 1.5 + (uy / ul) * 0.6, 0.7);
    U.e(tone(col.skin, -0.22), hx - nx * 0.4 + (ux / ul) * 0.5, hy - ny * 0.4 + (uy / ul) * 0.5, 0.6);
  }
  // Note: the torso is a coat back with a lit shoulder, a centre seam, suspenders, a belt with loops and a holster.
  const rx = 6 * k * g.torso;
  const ry = 10 * k;
  B.e(OUTLINE, tx, ty, rx + 0.9, ry + 0.9);
  B.e(col.coat, tx, ty, rx, ry);
  B.e(tone(col.coat, -0.18), tx - 1.2, ty, rx - 0.5, ry - 0.3);
  B.e(tone(col.coat, 0.14), tx + 0.8, ty - 1.4, rx * 0.62, ry * 0.7);
  B.r(tone(col.coat, -0.4), tx - rx + 0.6, ty - 0.4, rx * 0.9, 0.8);
  if (FINE) for (const sy of [-1, 1]) {
    B.e(tone(col.coat, 0.1), tx + 0.6, ty + sy * 7 * k, 3.2 * k, 2.4 * k);
    B.l(tone(col.coat, -0.42), tx - 2.6 * k, ty + sy * 5.4 * k, tx + 2.8 * k, ty + sy * 8.2 * k, 0.7);
    B.l(tone(col.coat, -0.25), tx - rx * 0.7, ty + sy * ry * 0.35, tx - rx * 0.5, ty + sy * ry * 0.75, 0.6);
  }
  B.e(col.shirt, 1 + tx, ty, 3.6 * k, 7 * k);
  B.e(tone(col.shirt, -0.12), 1 + tx, ty, 2.4 * k, 5 * k);
  // Note: an apron: the bib on the chest, a strap over each shoulder, a bow and two tails at the back.
  if (col.apron != null) {
    B.e(OUTLINE, 2.6 * k + tx, ty, 3.9 * k + 0.7, 6.4 * k + 0.7);
    B.e(col.apron, 2.6 * k + tx, ty, 3.9 * k, 6.4 * k);
    B.e(tone(col.apron, -0.14), 1.6 * k + tx, ty + 1, 2.2 * k, 4.6 * k);
    for (const sy of [-1, 1]) B.l(col.apron, tx + 3.4 * k, ty + sy * 5.4 * k, tx - 3.6 * k, ty + sy * 8 * k, 1.1);
    B.l(tone(col.apron, -0.2), tx - 7 * k, ty - 1, tx - 11 * k, ty - 4, 1.2);
    B.l(tone(col.apron, -0.2), tx - 7 * k, ty + 1, tx - 11 * k, ty + 4, 1.2);
    B.e(col.apron, tx - 7 * k, ty, 1.6, 2.4);
  }
  if (col.vest != null) {
    B.l(col.vest, tx + 1, ty - 3.4 * k, tx - 5 * k, ty - 2.8 * k, 1.3);
    B.l(col.vest, tx + 1, ty + 3.4 * k, tx - 5 * k, ty + 2.8 * k, 1.3);
  }
  if (col.belt) {
    B.l(C.WOOD_D, tx - 4.2 * k, ty - 7.4 * k, tx - 4.2 * k, ty + 7.4 * k, 1.5);
    for (let i = -3; i <= 3; i++) B.r(C.GOLD, tx - 4.9 * k, ty + i * 2.1 * k, 0.9, 0.9);
    B.r(OUTLINE, tx - 7 * k, ty + 6 * k, 5.6, 3.6);
    B.r(C.WOOD_D, tx - 6.6 * k, ty + 6.4 * k, 4.8, 2.8);
    B.r(C.WOOD, tx - 6.6 * k, ty + 6.4 * k, 4.8, 0.8);
  }
  if (col.poncho != null) {
    B.e(OUTLINE, tx, ty, rx + 2.2, ry + 1.8);
    B.e(col.poncho, tx, ty, rx + 1.4, ry + 1);
    B.e(tone(col.poncho, 0.12), tx + 0.6, ty - 1.4, rx * 0.8, ry * 0.7);
    for (const sx of [-4, -1, 2]) B.l(C.DARK, tx + sx * k, ty - ry * 0.8, tx + sx * k, ty + ry * 0.8, 1);
    B.l(C.GOLD, tx + 4.4 * k, ty - ry * 0.6, tx + 4.4 * k, ty + ry * 0.6, 0.8);
    B.e(C.DARK, tx + 0.8, ty, 3.6 * k, 3.6 * k);
  }
  if (col.shawl != null) {
    B.e(col.shawl, tx + 1, ty, 4.4 * k, 8 * k);
    B.l(tone(col.shawl, -0.3), tx + 4 * k, ty - 6 * k, tx - 5 * k, ty, 0.9);
    B.l(tone(col.shawl, -0.3), tx + 4 * k, ty + 6 * k, tx - 5 * k, ty, 0.9);
  }
  runOps(U, g.gun);
  runOps(U, g.extra);
  if (o.load) {
    // Note: the carried body is part of the carrier's picture, so nothing depends on how two images are ordered; the hands go on top, gripping it.
    if (o.bloody) drawBlood(U, o);
    const lb = turned(U, -4, 4);
    drawBody(lb, (o.load === 'flail' ? 2 : 0) + (o.lph | 0), OUTFIT.sheriff);
    if (o.loadBloody) drawBlood(lb, { state: 'down', bloody: true });
    for (const [, , x1, y1] of g.arms) {
      U.e(OUTLINE, x1, y1, 2.3);
      U.e(col.skin, x1, y1, 1.7);
    }
  }
  // Note: head, hair or hat, and the bandana tails.
  const hx = g.tx + g.hx + 0.5;
  const hy = lo - ty + g.hy;
  drawBandana(U, col, hx, hy, k, gait);
  drawHead(U, col, o, hx, hy, k, g.hat);
  // Note: the badge peeks out at the left shoulder, past the brim, as a gold glint.
  if (col.badge != null) star(U, tx + 2.4, -9.2 * k, 2.2, col.badge);
  if (o.variant === 'green') U.r(C.RED, hx - 6, hy + 3, 3, 2);
  if (o.variant === 'veteran') U.r(C.STONE_L, hx - 1, hy - 1, 3, 1.4);
}

// Note: hand positions per phase for a prone reload (the working hand) and a prone signal (the left hand; the right keeps the gun).
const PRONE_RIFLE_LOAD = [[-6, 6], [0, 7], [6, 6], [2, 7]];
const PRONE_GUN_LOAD = [[-6, 6], [2, 6], [7, 4], [0, 7], [6, 3], [10, 5], [0, 7], [-5, 6]];
const PRONE_SIGNAL = { 0: [21, -9], 3: [15, -10], 4: [15, -3], 5: [12, -2], 6: [12, -3.2], 7: [12.5, 0.5], 8: [12.5, -0.8], 9: [17, -6], 10: [19, -6], 11: [4, -8], 12: [5, -9], 13: [7, -15], 14: [-4, -11] };
// Note: the prone pose of a frame: the two hands, the gun as { x0, x1, y, tilt } or null, a cartridge glint, and how the signalling hand is shown.
function pronePose(o) {
  const ph = o.ph | 0;
  const rifle = o.weapon === 'rifle';
  const gun = o.weapon === 'none' ? null : { x0: 8, x1: rifle ? 27 : 20, y: 2, tilt: 0 };
  const pose = { hands: [[13, -5], [13, 5]], gun, glint: null, finger: false, plain: true };
  if (o.act === 'reload' && gun) {
    // Note: the gun comes in to the chest and the free hand works between the belt and the gate, as in the standing reload.
    const table = rifle ? PRONE_RIFLE_LOAD : PRONE_GUN_LOAD;
    const p = table[ph % table.length];
    pose.gun = { x0: 3, x1: rifle ? 22 : 13, y: 4, tilt: 2 };
    pose.hands = [[rifle ? 14 : 9, 5], p];
    pose.glint = rifle ? (ph % 4 < 3 ? p : null) : ph < 3 ? p : ph === 4 ? [11, 6] : null;
    pose.plain = false;
  } else if (o.act === 'signal' && PRONE_SIGNAL[ph]) {
    pose.hands[0] = PRONE_SIGNAL[ph];
    pose.plain = false;
    pose.finger = ph === 0 || ph === 5 || ph === 6;
    // Note: the raised fist of cover me stands up from the ground, so it is drawn larger, with its shadow.
    pose.raised = ph === 11 || ph === 12;
    pose.atMouth = ph >= 5 && ph <= 8;
  }
  return pose;
}

// Note: a living prone person faces forward with their weapon out; the legs alternate while crawling, and reloading and hand signals move the arms.
function drawProne(ctx, o, col) {
  const B = brush(ctx);
  const crawl = o.act === 'walk' ? (o.ph % 2 ? 2 : -2) : 0;
  const pants = col.pants ?? C.DARK;
  const pose = pronePose(o);
  B.e('rgba(10,8,6,0.3)', -1, 2, 19, 9);
  for (const side of [-1, 1]) {
    const y = side * 4;
    B.l(OUTLINE, -5, y, -21 + side * crawl, y + side * 2, 5);
    B.l(pants, -5, y, -21 + side * crawl, y + side * 2, 3.5);
    B.l(C.DARK, -21 + side * crawl, y + side * 2, -25 + side * crawl, y + side * 2, 3.5);
    // Note: the resting arms lie under the body; a reload or a signal draws them over it below.
    if (pose.plain) {
      B.l(OUTLINE, 1, y, 13, side * 5, 4.5);
      B.l(col.coat, 1, y, 13, side * 5, 3);
      B.e(col.skin, 13, side * 5, 1.8);
    }
  }
  B.e(OUTLINE, -3, 0, 11, 8);
  B.e(col.coat, -3, 0, 10, 7);
  B.l(tone(col.coat, 0.15), -9, -4, 3, -4, 1.2);
  if (col.belt) B.l(C.WOOD_D, -10, -6, -10, 6, 1.5);
  if (pose.gun) {
    const g = pose.gun;
    B.l(OUTLINE, g.x0 + 1, g.y, g.x1, g.y + g.tilt, 3.4);
    B.l(C.IRON, g.x0 + 2, g.y, g.x1, g.y + g.tilt, 1.7);
    B.l(C.WOOD, g.x0, g.y, g.x0 + 7, g.y + g.tilt * 0.3, 2.5);
  }
  if (!pose.plain) pose.hands.forEach(([hx, hy], i) => {
    const sy = i ? 4 : -4;
    if (pose.raised && !i) B.e('rgba(10,8,6,0.3)', hx + 2, hy + 2, 2.6, 2);
    B.l(OUTLINE, 1, sy, hx, hy, 4.5);
    B.l(col.coat, 1, sy, hx, hy, 3);
    B.e(OUTLINE, hx, hy, pose.raised && !i ? 3.2 : 2.3);
    B.e(col.skin, hx, hy, pose.raised && !i ? 2.6 : 1.8);
    if (pose.finger && !i) B.l(col.skin, hx, hy, hx + 3.2, hy - 1.2, 1.1);
  });
  if (pose.glint) B.r(C.GOLD_L, pose.glint[0] + 1, pose.glint[1] - 1, 2, 1);
  B.e(col.shirt, 4.8, 0, 2.4, 4.2);
  B.e(tone(col.shirt, -0.2), 4.4, 0, 1.6, 3);
  if (FINE) {
    B.l(tone(col.coat, -0.4), -9.5, 0, 2, 0, 0.7);
    for (const sy of [-3.6, 3.6]) B.l(tone(col.coat, -0.28), -8, sy, -4.4, sy * 1.4, 0.6);
    for (const side of [-1, 1]) B.l(C.WOOD_D, -22.6 + side * crawl, side * 6 - 1.2, -22.6 + side * crawl, side * 6 + 1.2, 0.8);
  }
  drawHead(B, col, o, 8, 0, 0.78, 0);
  // Note: the quiet hand and the hand cupped at the mouth lie over the face, so they are drawn after the head.
  if (pose.atMouth) {
    const [hx, hy] = pose.hands[0];
    B.e(OUTLINE, hx, hy, 2.4);
    B.e(col.skin, hx, hy, 1.9);
    if (pose.finger) B.l(col.skin, hx, hy, hx + 1.4, hy - 3, 1.1);
  }
}

function drawLying(ctx, o, col) {
  const B = brush(ctx);
  const dead = o.state === 'dead';
  const pants = col.pants ?? C.DARK;
  B.e('rgba(10,8,6,0.32)', 1, 2, 15, 11);
  B.e('rgba(70,14,10,0.7)', -1, 1, dead ? 13 : 9, dead ? 11 : 8);
  B.e('rgba(110,24,18,0.5)', -2, 0, dead ? 8 : 5, dead ? 7 : 4.6);
  // Note: limbs spread; the pose differs a little between dead and incapacitated.
  const limb = (x0, y0, x1, y1, c) => {
    B.l(OUTLINE, x0, y0, x1, y1, 4.6);
    B.l(c, x0, y0, x1, y1, 3.2);
  };
  limb(-4, 5, -16, 9, pants);
  limb(-4, -5, -15, -8, pants);
  B.r(C.DARK, -19, 7.4, 5, 3.4);
  B.r(C.DARK, -18, -10, 5, 3.4);
  limb(2, 5, 14, dead ? 11 : 8, col.coat);
  limb(2, -5, 13, -(dead ? 10 : 6), col.coat);
  B.e(OUTLINE, 14.6, dead ? 11 : 8, 2.3);
  B.e(col.skin, 14.6, dead ? 11 : 8, 1.7);
  B.e(OUTLINE, 13.6, -(dead ? 10 : 6), 2.3);
  B.e(col.skin, 13.6, -(dead ? 10 : 6), 1.7);
  B.e(OUTLINE, -1, 0, 7.9, 10.9);
  B.e(col.coat, -1, 0, 7, 10);
  B.e(tone(col.coat, -0.2), -2, 0, 6.4, 9.6);
  B.e(tone(col.coat, 0.1), 0, -2, 4, 6);
  B.e(col.shirt, -1, 0, 4, 7);
  if (FINE) {
    B.l(tone(col.coat, -0.4), -7, 0, 2, 0, 0.7);
    for (const sy of [-5, 5]) B.l(tone(col.coat, -0.3), -5, sy, -1, sy * 1.5, 0.6);
  }
  if (col.belt) B.l(C.WOOD_D, -5, -8, -5, 8, 1.5);
  if (col.poncho != null) {
    B.e(col.poncho, -1, 0, 8, 10.4);
    B.l(C.DARK, -4, -9, -4, 9, 1);
  }
  B.e(OUTLINE, 9.6, -1, 5.2);
  B.e(col.skin, 9.6, -1, 4.4);
  B.e(tone(col.skin, 0.12), 13.6, -1, 1.1, 0.9);
  if (col.hat != null) {
    B.e(OUTLINE, 5, 6, 7, 3.8);
    B.e(tone(col.hat, -0.1), 5, 6, 6.2, 3.2);
    B.e(col.hat, 5.4, 5.8, 3.6, 2);
  } else if (col.hair != null) {
    B.e(col.hair, 8.6, -1, 3.8, 3.8);
    B.e(col.hair, 5.6, -1, 2.4, 2.4);
  }
  if (col.bandana) B.e(col.bandana, 5.2, -1, 2.4, 2.4);
  if (o.weapon !== 'none') runOps(B, o.weapon === 'rifle' ? rifleOps(12, 15, 36, 17) : gunOps(12, 15, 21, 17));
  if (col.badge != null) star(B, 1, -4.4, 2.4, col.badge);
}

// Note: the same ops turned a quarter and shifted, so a body drawn in its own frame lies across a carrier's shoulders (its x runs to the carrier's right).
function turned(B, ox, oy) {
  return {
    r: (col, x, y, w = 1, h = 1) => B.r(col, ox - y - h, oy + x, h, w),
    e: (col, x, y, rx, ry = rx) => B.e(col, ox - y, oy + x, ry, rx),
    l: (col, x0, y0, x1, y1, w = 1) => B.l(col, ox - y0, oy + x0, ox - y1, oy + x1, w),
    g: (col, pts) => B.g(col, pts.map(([x, y]) => [ox - y, oy + x])),
  };
}

// Note: a body slung over the carrier's shoulders, the sprite's x axis across the carrier; frames 0 and 1 are limp, 2 and 3 are a struggle.
function drawCarried(ctx, o, col) {
  drawBody(brush(ctx), o.ph, col);
}

function drawBody(B, ph, col) {
  const flail = ph >= 2;
  const sw = ph % 2 ? 2.4 : -2.4;
  const pants = col.pants ?? C.DARK;
  B.e('rgba(10,8,6,0.28)', 1.4, 5, 24, 8);
  // Note: legs hang off the carrier's left, boots last.
  for (const side of [-1, 1]) {
    const y = 3 * side;
    const ey = y + (flail ? -sw * side * 1.6 : sw * 0.4);
    B.l(OUTLINE, -6, y + 2, -26, ey + 2, 5.2);
    B.l(pants, -6, y + 2, -26, ey + 2, 3.8);
    B.l(tone(pants, 0.15), -8, y + 1.2, -24, ey + 1.2, 0.8);
    B.r(OUTLINE, -30, ey + 0.2, 6, 4.6);
    B.r(C.DARK, -29.4, ey + 0.8, 5.2, 3.4);
    B.r(C.WOOD_D, -28.4, ey + 0.8, 4.2, 0.9);
  }
  // Note: arms hang off the carrier's right beside the head, or flail up when awake.
  for (const side of [-1, 1]) {
    const ay = 6.4 * side;
    const hx = flail ? 15 : 17;
    const hy = flail ? ay + side * (6 + sw * side) : ay + side * 1.6 + (sw * 0.4);
    B.l(OUTLINE, 8, ay + 2, hx, hy + 2, 4.6);
    B.l(col.coat, 8, ay + 2, hx, hy + 2, 3.2);
    B.l(col.shirt, hx - 3, hy + 2 - (hy - ay) * 0.12, hx, hy + 2, 3.3);
    B.e(OUTLINE, hx + 1, hy + 2, 2.4);
    B.e(col.skin, hx + 1, hy + 2, 1.8);
  }
  // Note: the torso lies across the carrier's shoulders, outlined so it does not melt into them.
  B.e(OUTLINE, 1.5, 2, 9.4, 7.7);
  B.e(col.coat, 1.5, 2, 8.6, 6.9);
  B.e(tone(col.coat, -0.2), 0.5, 3, 8, 6);
  B.e(tone(col.coat, 0.14), 3, 0.4, 5.4, 4);
  B.l(tone(col.coat, -0.4), 0, 2, 9, 2, 0.8);
  B.e(col.shirt, 6.4, 2, 3, 4.8);
  if (col.vest != null) B.l(col.vest, 5, 0, -4, 0.4, 1.2);
  if (col.belt) B.l(C.WOOD_D, -4.6, -4, -4.6, 8.4, 1.4);
  if (col.poncho != null) {
    B.e(col.poncho, 1.5, 2, 8.6, 7);
    B.l(C.DARK, -2, -3, -2, 7, 1);
  }
  if (col.badge != null) star(B, 3, -2.4, 2.6, col.badge);
  // Note: the head sits a little ahead of the arms, with a hat tipped off to one side.
  B.e(OUTLINE, 15.6, 2, 5.8);
  B.e(col.skin, 15.6, 2, 5);
  B.e(tone(col.skin, 0.12), 15.6, 6.8, 1.1, 1.3);
  if (col.hat != null) {
    B.e(OUTLINE, 18.4, -3.4, 7.2, 6.4);
    B.e(tone(col.hat, -0.14), 18.4, -3.4, 6.5, 5.7);
    B.e(col.hat, 18.8, -3.6, 3.6, 3.2);
    B.l(tone(col.hat, -0.4), 16, -3.6, 21, -3.6, 0.8);
  } else if (col.hair != null) {
    B.e(col.hair, 14.6, 2, 5.4, 5.4);
    B.e(col.hair, 14, 8, 2.6, 2.6);
  }
  if (col.bandana) B.e(col.bandana, 11.6, 2, 2.4, 2.4);
}

// Note: red stains on the coat; more of them when the body is down.
function drawBlood(B, o) {
  const down = o.state !== 'ok';
  const dabs = down ? [[3, -3, 3.4, 3.4], [-4, 2, 3, 2.4], [-8, -4, 2.2, 2.2]] : [[2, -4, 3, 3.4], [-3, 3, 3.2, 4], [9, 4, 2, 2]];
  for (const [x, y, w, h] of dabs) {
    B.e(C.RED_D, x + w / 2, y + h / 2, w / 2 + 0.4, h / 2 + 0.3);
    B.e(C.RED, x + w / 2 - 0.2, y + h / 2 - 0.2, w / 4, h / 4);
  }
}

// Note: the held model's id when it has its own drawing for the pose's class; the Winchester and the Colt are the default, so they leave the key unchanged.
function modelOf(a, kind) {
  const id = a.weapons && a.weapons[a.cur] && a.weapons[a.cur].id;
  const w = WEAPONS[id];
  if (!w || !GUN_PARTS[id] || id === 'winchester73' || id === 'colt73') return '';
  return (w.kind === 'rifle') === (kind === 'rifle') ? id : '';
}

// Note: f is an optional animation frame from js/anim.js; it can override weapon, stance and state and names the pose.
export function personDesc(a, f) {
  const fr = f || {};
  const gait = fr.gait || '';
  return {
    role: a.role,
    variant: variantOf(a),
    look: a.role === 'hostile' ? a.id % LOOKS.length : 0,
    weapon: fr.weapon || weaponKind(a),
    model: modelOf(a, fr.weapon || weaponKind(a)),
    stance: fr.stance || (a.stance === 'prone' ? 'prone' : a.stance === 'crouch' ? 'crouch' : 'stand'),
    lean: Math.round((a.lean || 0) * 13) / 13,
    state: fr.state || (a.status === 'dead' ? 'dead' : a.status === 'incapacitated' ? 'down' : 'ok'),
    bloody: !!(a.wounds && a.wounds.some((w) => !w.old)),
    act: fr.act || 'none',
    ph: fr.ph | 0,
    stow: fr.stow || '',
    gait: gait === 'sprint' || gait === 'creep' || gait === 'hunch' || gait === 'ready' || gait === 'watch' ? gait : '',
    sweep: gait === 'watch' ? Math.max(-5, Math.min(5, Math.round(fr.sweep || 0))) : 0,
    load: fr.load === 'limp' || fr.load === 'flail' ? fr.load : '',
    lph: fr.lph | 0,
    loadBloody: !!fr.loadBloody,
    nod: fr.nod | 0,
    hit: fr.hit || '',
    style: styleOf(a),
    face: typeof a.face === 'string' ? a.face : '',
  };
}

export const personKey = (o) =>
  `person:${o.role}:${o.variant}:${o.look | 0}:${o.weapon}${o.model ? `.${o.model}` : ''}:${o.stance}:${Math.round((o.lean || 0) * 13)}:${o.state}:${o.bloody ? 1 : 0}:${o.act || 'none'}:${o.ph | 0}:${o.stow || ''}:${o.gait || ''}${o.gait === 'watch' ? o.sweep | 0 : ''}${o.load ? `:${o.load}${o.lph | 0}${o.loadBloody ? 'b' : ''}` : ''}${o.nod ? `:h${o.nod}` : ''}${o.hit ? `:x${o.hit}` : ''}${o.style ? `:c${o.style}` : ''}${o.face ? `:f${o.face}` : ''}`;

// Note: least recently used first; a map keeps insertion order, so touching a key moves it to the end.
const used = new Map();

// Note: textures are drawn on first use and cached by key; isUsed lets the scene protect keys that an image still shows.
export function ensurePerson(scene, o, isUsed = () => false) {
  const key = personKey(o);
  if (scene.textures.exists(key)) {
    used.delete(key);
    used.set(key, 1);
    return key;
  }
  const size = Math.round((PSIZE * SCALE) / 2);
  const cnv = makeTextureCanvas(size, size);
  const ctx = cnv.getContext('2d');
  const col = outfitOf(o);
  held = o.model || '';
  if (o.act === 'carried') drawCarried(ctx, o, col);
  else if (o.state === 'ok' && o.stance === 'prone') drawProne(ctx, o, col);
  else if (o.state === 'ok') drawStanding(ctx, o, col);
  else drawLying(ctx, o, col);
  if (o.bloody && !(o.load && o.state === 'ok')) drawBlood(brush(ctx), o);
  scene.textures.addCanvas(key, cnv);
  used.delete(key);
  used.set(key, 1);
  if (used.size > PEOPLE_MAX && scene.textures.remove) {
    for (const old of used.keys()) {
      if (used.size <= PEOPLE_MAX) break;
      if (old === key || isUsed(old)) continue;
      used.delete(old);
      if (scene.textures.exists(old)) scene.textures.remove(old);
    }
  }
  return key;
}

export const peopleCached = () => used.size;

// Note: item 497: half-extents in texels of a figure seen from the rim up: head and shoulders when little shows, the whole sprite when all of him does.
const RIM_HX = 9;
const RIM_HY = 12;

// Note: the texture crop [x, y, w, h] in texture pixels for a figure of the given height seen from cut metres up, or null when nothing is cut; the sprite's x runs along the facing, so the crop turns with him.
export function rimCrop(cut, height, lean = 0) {
  if (!(cut > 0)) return null;
  const f = Math.max(0, Math.min(1, (height - cut) / height)) ** 2;
  const hx = RIM_HX + (PC - RIM_HX) * f;
  const hy = RIM_HY + (PC - RIM_HY) * f;
  const cy = PC + Math.round(lean * 13) * LEAN_BODY;
  const q = SCALE / 2;
  const x0 = Math.max(0, PC - hx);
  const y0 = Math.max(0, cy - hy);
  return [x0 * q, y0 * q, (Math.min(PSIZE, PC + hx) - x0) * q, (Math.min(PSIZE, cy + hy) - y0) * q];
}
