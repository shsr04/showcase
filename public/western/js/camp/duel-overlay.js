// Note: the sight picture of a sheriff's duel, painted from the sim's view alone: the revolver's sights against the foe, with the two rings of the aim on top in the same scale.
import { PAL, C } from '../palette.js';
import { RING } from './duel-draw.js';

// Note: the sight picture: a ring of this share of the window's shorter side, one scale for the whole window and never a scene zoom; ground is the share of the ring where the foe's boots stand, span the metres across the ring at the foe's distance (least, most, and the share of the distance), ref the ring size the sights were drawn for.
export const SIGHT = { view: 0.5, ground: 0.84, span: { min: 3.7, max: 8, per: 0.24 }, ref: 415 };

const INK = '#1a1410';
const BRASS = '#b08a3c';
const BRASS_L = '#e0c070';
const hex = (i) => PAL[i];
const COATS = { green: [C.STONE, C.RED, C.PLANK], seasoned: [C.ADOBE_D, C.STONE, C.DARK], veteran: [C.WOOD_D, C.IRON, C.SHADOW] };

// Note: the ring in CSS pixels for a window whose shorter side is this long; it never depends on the stage or anything in the scene.
export const insetSide = (shorter) => Math.max(1, Math.round(shorter * SIGHT.view));

// Note: where the ring stands in the window: at the middle, so the rings drawn in it read as a front view and never as a point in the street.
export const insetPlace = (width, height) => {
  const side = insetSide(Math.min(width, height));
  return { side, left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) };
};

// Note: pixels in the ring for one metre on the foe, the one scale between the sim's aim and the picture: the ring shows a span of the distance that is kept between the limits.
export const sightScale = (side, distance) => side / Math.min(SIGHT.span.max, Math.max(SIGHT.span.min, SIGHT.span.per * distance));

// Note: where the front blade's tip stands in the ring for an aim given in metres on the foe (lateral to the right, height above his boots); the foe stands at the middle of the ring on its ground line.
export function sightAt(side, distance, aim) {
  const scale = sightScale(side, distance);
  return { x: side / 2 + aim.lateral * scale, y: side * SIGHT.ground - aim.height * scale };
}

// Note: the backing store of a ring: one device pixel for each pixel it is shown at; resizing clears the canvas and is done only when the size changed.
export function sizeInset(canvas, side, dpr = 1) {
  const px = Math.max(1, Math.round(side * Math.max(1, dpr)));
  if (canvas.width !== px) canvas.width = px;
  if (canvas.height !== px) canvas.height = px;
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  return px;
}

// Note: the sight picture is pixel art on a grid of this many art pixels across the ring, so it reads like the scene around it.
export const ART = 96;

// Note: a painter on the art grid: rects in art pixels or in metres on the foe are snapped to whole art pixels and filled with a palette colour.
function painter(sg, side, cx, ground, ppm) {
  const px = side / ART;
  const snap = (v) => Math.round(v / px) * px;
  const cell = (gx, gy, gw, gh, color) => {
    sg.fillStyle = hex(color);
    sg.fillRect(gx * px, gy * px, gw * px, gh * px);
  };
  // Note: a box from (left, top) in metres on the foe, w across and h down, at least one art pixel each way.
  const box = (left, top, w, h, color) => {
    const x0 = snap(cx + left * ppm);
    const y0 = snap(ground - top * ppm);
    sg.fillStyle = hex(color);
    sg.fillRect(x0, y0, Math.max(px, snap(cx + (left + w) * ppm) - x0), Math.max(px, snap(ground - (top - h) * ppm) - y0));
  };
  // Note: the same box grown by one art pixel each way, for the dark outline every sprite of the game carries.
  const rim = (left, top, w, h) => {
    const x0 = snap(cx + left * ppm) - px;
    const y0 = snap(ground - top * ppm) - px;
    sg.fillStyle = INK;
    sg.fillRect(x0, y0, Math.max(px, snap(cx + (left + w) * ppm) - x0 - px) + 2 * px, Math.max(px, snap(ground - (top - h) * ppm) - y0 - px) + 2 * px);
  };
  return { px, cell, box, rim };
}

// Note: a checkerboard of one colour over a band of art rows, the dither that joins two bands of the palette.
function dither(p, gx0, gy0, gw, gh, color, phase = 0) {
  for (let y = gy0; y < gy0 + gh; y++) for (let x = gx0 + ((y + phase) % 2); x < gx0 + gw; x += 2) p.cell(x, y, 1, 1, color);
}

// Note: what stands behind the foe for each venue, on the horizon at the shooter's eye height; seeded so one duel keeps one backdrop.
function paintBackdrop(p, look, hz, light) {
  const r = seeded(look.seed || 1);
  const far = look.mood === 'day' || !look.mood ? (look.grass ? C.GREEN_D : C.ADOBE_D) : light.far;
  const night = look.mood === 'night';
  // Note: far mesas, flat-topped and stepped.
  for (let x = 0; x < ART; ) {
    const w = 6 + Math.floor(r() * 14);
    const h = 1 + Math.floor(r() * 4);
    p.cell(x, hz - h, w, h, x % 3 ? light.far : far);
    p.cell(x + 1, hz - h - 1, Math.max(1, w - 3), 1, light.far);
    x += w;
  }
  const kind = look.kind || 'street';
  if (kind === 'street') {
    // Note: false fronts on both sides, smaller toward the middle where the street runs off.
    for (const dir of [-1, 1]) {
      let x = dir < 0 ? 6 : ART - 6;
      for (let i = 0; i < 4; i++) {
        const w = 9 + Math.floor(r() * 6) - i;
        const h = 18 - i * 3 + Math.floor(r() * 4);
        const left = dir < 0 ? x : x - w;
        const wall = (night ? [C.WOOD_D, C.DARK, C.WOOD_D, C.WOOD] : [C.WOOD, C.ADOBE, C.WOOD_L, C.PLANK])[Math.floor(r() * 4)];
        p.cell(left, hz - h + 3, w, h, wall);
        p.cell(left, hz - h + 3, w, 1, C.WOOD_D);
        p.cell(left + 1, hz - h + 7, w - 2, 1, C.WOOD_D);
        // Note: windows are dark by day and lamplit from dusk.
        for (let k = left + 2; k < left + w - 2; k += 3) p.cell(k, hz - h + 9, 1, 2, light.lit && r() < 0.7 ? C.GOLD_L : C.BLUE_D);
        p.cell(left, hz + 2, w, 1, C.WOOD_D);
        // Note: the next front stands nearer the middle, where the street runs off.
        x -= dir * w;
        if (Math.abs(x - ART / 2) < 16) break;
      }
    }
  } else if (kind === 'yard') {
    // Note: the saloon's back wall in planks, a door and a woodpile.
    p.cell(8, hz - 12, ART - 16, 15, C.WOOD);
    for (let y = hz - 10; y < hz + 3; y += 3) p.cell(8, y, ART - 16, 1, C.WOOD_D);
    p.cell(20, hz - 6, 6, 9, light.lit ? C.GOLD : C.WOOD_D);
    p.cell(66, hz - 1, 10, 4, C.PLANK);
    dither(p, 66, hz - 1, 10, 4, C.WOOD_D);
  } else if (kind === 'corral') {
    // Note: the livery barn and the corral's rails.
    p.cell(6, hz - 14, 24, 17, C.RED_D);
    p.cell(6, hz - 14, 24, 1, C.WOOD_D);
    p.cell(14, hz - 6, 8, 9, C.WOOD_D);
    for (let x = 0; x < ART; x += 8) p.cell(x, hz - 3, 1, 7, C.WOOD_D);
    p.cell(0, hz - 2, ART, 1, C.PLANK);
    p.cell(0, hz + 1, ART, 1, C.PLANK);
  } else {
    // Note: open ground, scrub and rocks.
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * ART);
      p.cell(x, hz, 3, 2, i % 3 ? C.GREEN_D : C.STONE);
      p.cell(x + 1, hz - 1, 1, 1, C.GREEN_D);
    }
  }
}

// Note: a small deterministic stream for the backdrop, so a repaint draws the same picture.
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Note: the foe as a front-facing sprite in his own colours, outlined in ink, every part at the size the hit model gives it in metres.
function paintFoe(p, view, look) {
  const [coat, shirt, hat] = COATS[look.experience] || COATS.seasoned;
  const part = (left, top, w, h, color) => [left, top, w, h, color];
  const draw = (parts) => {
    for (const [l, t, w, h] of parts) p.rim(l, t, w, h);
    for (const [l, t, w, h, color] of parts) p.box(l, t, w, h, color);
  };
  if (view.opponentStatus !== 'ok') {
    draw([part(-0.5, 0.3, 1.0, 0.26, coat), part(-0.5, 0.3, 1.0, 0.06, C.SHADOW), part(0.5, 0.36, 0.3, 0.06, hat), part(0.55, 0.28, 0.2, 0.2, C.ADOBE_L)]);
    return;
  }
  const drawn = view.opponent !== 'holstered' && view.weaponHeld.opponent;
  const lift = view.opponent === 'drawing' ? view.opponentDrawProgress : drawn ? 1 : 0;
  const hand = Math.min(0.82 + 0.5 * lift, 1.3);
  draw([
    part(-0.2, 0.9, 0.17, 0.9, C.DARK), part(0.03, 0.9, 0.17, 0.9, C.DARK),
    part(-0.22, 0.12, 0.2, 0.12, C.WOOD_D), part(0.02, 0.12, 0.2, 0.12, C.WOOD_D),
    part(-0.36, 1.4, 0.1, 0.55, coat), part(0.26, 1.4, 0.1, 0.55, coat),
    part(-0.26, 1.45, 0.52, 0.62, coat),
    part(-0.07, 1.6, 0.14, 0.12, C.ADOBE),
    part(-0.11, 1.73, 0.22, 0.22, C.ADOBE_L),
    part(-0.21, 1.75, 0.42, 0.06, hat), part(-0.1, 1.84, 0.2, 0.1, hat),
    part(-0.36, 0.92, 0.1, 0.1, C.ADOBE_L), part(0.26, hand + 0.05, 0.1, 0.1, C.ADOBE_L),
  ]);
  p.box(-0.06, 1.42, 0.12, 0.4, shirt);
  p.box(-0.02, 1.42, 0.04, 0.24, C.RED_D);
  p.box(0.16, 1.45, 0.1, 0.62, C.SHADOW);
  p.box(-0.26, 0.9, 0.52, 0.06, C.WOOD_D);
  p.box(-0.03, 0.9, 0.06, 0.06, C.GOLD);
  p.box(0.2, 0.86, 0.09, 0.26, C.WOOD_D);
  p.box(-0.11, 1.69, 0.22, 0.04, C.ADOBE);
  p.box(-0.06, 1.66, 0.03, 0.03, C.SHADOW);
  p.box(0.03, 1.66, 0.03, 0.03, C.SHADOW);
  p.box(-0.1, 1.78, 0.2, 0.03, C.RED_D);
  p.box(-0.21, 0.12, 0.42, 0.03, C.VOID);
  if (drawn) {
    p.rim(0.27, hand + 0.1, 0.12, 0.08);
    p.box(0.27, hand + 0.1, 0.12, 0.08, C.IRON);
  }
  for (const e of view.shots) {
    if (e.who !== 'player' || !e.hit) continue;
    const [mx, my] = { head: [0, 1.62], chest: [0, 1.25], abdomen: [0, 1.0], arm: [0.3, 1.2], leg: [0.1, 0.4] }[e.hit] || [0, 1.2];
    p.box(mx - 0.04, my + 0.04, 0.08, 0.08, C.RED);
  }
}

// Note: the Colt's sights in blued iron, built of blocks of u pixels: the rear leaf with its notch, the front blade with its tip at (tx, ty), and the hammer's spur behind, down or drawn back; a light top edge lets them read against the sky.
function paintSights(sg, tx, ty, cocked, u) {
  const q = Math.max(1, Math.round(u * 2));
  const block = (gx, gy, gw, gh, color) => {
    sg.fillStyle = color;
    sg.fillRect(tx + gx * q, ty + gy * q, gw * q, gh * q);
  };
  const [iron, edge, ink] = [hex(C.IRON), hex(C.IRON_L), INK];
  block(-14, 3, 28, 10, ink);
  block(-13, 3, 26, 9, iron);
  block(-13, 3, 26, 1, edge);
  block(-4, 3, 8, 5, ink);
  block(-3, 3, 6, 4, hex(C.PLASTER_L));
  block(-1, 0, 2, 13, ink);
  block(-1, 0, 2, 1, edge);
  const rise = cocked ? 7 : 3;
  block(-2, 13, 4, rise, ink);
  block(-1, 13, cocked ? 5 : 3, rise - 1, iron);
}

// Note: the light of the hour, the moods of the saloon: sky bands from the top down, ground colours for dirt and grass, the sun or the moon, stars, lit windows, and the shade laid over the foe.
export const LIGHT = {
  day: { sky: [C.GLASS_L, C.PLASTER_L, C.PLASTER, C.SAND_L], dirt: [C.SAND, C.SAND_D, C.ADOBE_D], grass: [C.GREEN, C.GREEN_D, C.SAND_D], far: C.STONE, body: null, stars: 0, lit: false, shade: null },
  dusk: { sky: [C.BLUE, C.RED_L, C.GOLD, C.GOLD_L], dirt: [C.ADOBE, C.ADOBE_D, C.WOOD_L], grass: [C.GREEN_D, C.DARK, C.WOOD], far: C.WOOD_D, body: [C.BONE, 62, 4], stars: 0, lit: true, shade: [C.RED_D, 0.14] },
  night: { sky: [C.BLUE_D, C.BLUE_D, C.BLUE_D, C.BLUE], dirt: [C.STONE, C.IRON_L, C.IRON], grass: [C.GREEN_D, C.IRON, C.DARK], far: C.DARK, body: [C.BONE, 30, 3], stars: 30, lit: true, shade: [C.BLUE_D, 0.38] },
};
const lightOf = (look) => LIGHT[look.mood] || LIGHT.day;

// Note: a disc of art pixels, for the sun and the moon.
function disc(p, gx, gy, r, color) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) p.cell(gx + x, gy + y, 1, 1, color);
}

// Note: what lies behind the foe: the sky in dithered bands with the sun low at dusk or the moon and stars at night, the venue, the ground with its ruts and stones, and his shadow.
function paintBack(p, look, hz, feet) {
  const light = lightOf(look);
  const bands = light.sky;
  const step = Math.max(1, Math.ceil(hz / bands.length));
  bands.forEach((color, i) => {
    p.cell(0, i * step, ART, step, color);
    if (i) dither(p, 0, i * step - 2, ART, 2, color, i);
  });
  const sky = seeded((look.seed || 1) ^ 0x2545);
  for (let i = 0; i < light.stars; i++) p.cell(Math.floor(sky() * ART), Math.floor(sky() * (hz - 8)), 1, 1, sky() < 0.3 ? C.BONE : C.GLASS_L);
  if (light.body) {
    const [color, x, r] = light.body;
    // Note: the sun hangs just over the far mesas; the moon is a crescent high up.
    disc(p, x, look.mood === 'night' ? 20 : hz - 9, r, color);
    if (look.mood === 'night') disc(p, x + 2, 19, r, C.BLUE_D);
  }
  paintBackdrop(p, look, hz, light);
  const dirt = look.grass ? light.grass : light.dirt;
  p.cell(0, hz + 3, ART, ART - hz - 3, dirt[0]);
  dither(p, 0, hz + 3, ART, 2, dirt[1]);
  // Note: wheel ruts running off to the horizon behind the foe.
  for (let y = hz + 4; y < ART; y++) {
    const spread = (y - hz) * 0.9;
    for (const x of [ART / 2 - 6 - spread, ART / 2 + 6 + spread]) p.cell(Math.round(x), y, 1, 1, dirt[1]);
  }
  const r = seeded((look.seed || 1) ^ 0x9e37);
  for (let i = 0; i < 40; i++) p.cell(Math.floor(r() * ART), hz + 4 + Math.floor(r() * (ART - hz - 4)), 1, 1, dirt[2]);
  dither(p, ART / 2 - 7, feet - 1, 14, 2, C.SHADOW);
}

// Note: the edge of the ring darkens in dithered steps, as an old glass would.
function paintFront(p) {
  for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) {
    const d = Math.hypot(x + 0.5 - ART / 2, y + 0.5 - ART / 2) / (ART / 2);
    if (d > 0.95 || (d > 0.87 && (x + y) % 2 === 0)) p.cell(x, y, 1, 1, C.DARK);
  }
}

// Note: the still layers are painted once per ring size and venue onto canvases of their own when the page can make one, else straight onto the ring.
const LAYERS = new Map();
function layersOf(sg, look, side, dpr, ground, scale) {
  const hz = Math.round((ground - 1.5 * scale) / (side / ART));
  const feet = Math.round(ground / (side / ART));
  const doc = sg.canvas?.ownerDocument;
  const key = [side, dpr, hz, look.kind, look.seed, look.grass, look.mood].join('|');
  if (doc && !LAYERS.has(key)) {
    const make = (fill) => {
      const canvas = doc.createElement('canvas');
      canvas.width = Math.max(1, Math.round(side * dpr));
      canvas.height = canvas.width;
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      fill(painter(g, side, side / 2, ground, scale));
      return canvas;
    };
    if (LAYERS.size > 8) LAYERS.clear();
    LAYERS.set(key, { back: make((q) => paintBack(q, look, hz, feet)), front: make(paintFront) });
  }
  const cached = doc ? LAYERS.get(key) : null;
  return {
    hz,
    paint(g, which) {
      if (cached) g.drawImage(cached[which], 0, 0, side, side);
      else if (which === 'back') paintBack(painter(g, side, side / 2, ground, scale), look, hz, feet);
      else paintFront(painter(g, side, side / 2, ground, scale));
    },
  };
}

// Note: the sight picture of a sheriff's duel in a ring of side CSS pixels (geom is { side, dpr, distance }): pixel art of the venue seen down the line of fire, the foe standing still in the middle, and the sights moving over him with the sheriff's sights; look is { experience, grass, kind, seed, calm, mood }; no letter or number is drawn; returns where the picture put the foe and the tip of the blade.
export function paintInset(sg, view, look, geom) {
  const { side, dpr = 1, distance = 10 } = geom;
  sg.setTransform(dpr, 0, 0, dpr, 0, 0);
  sg.clearRect(0, 0, side, side);
  sg.imageSmoothingEnabled = false;
  const c = side / 2;
  const ground = side * SIGHT.ground;
  const scale = sightScale(side, distance);
  const p = painter(sg, side, c, ground, scale);
  sg.save();
  sg.beginPath();
  sg.arc(c, c, c - 3, 0, Math.PI * 2);
  sg.clip();
  const layers = layersOf(sg, look, side, dpr, ground, scale);
  layers.paint(sg, 'back');
  paintFoe(p, view, look);
  // Note: the hour's shade lies over the foe too, so he stands in the same light as the street.
  const shade = lightOf(look).shade;
  if (shade) {
    sg.globalAlpha = shade[1];
    sg.fillStyle = hex(shade[0]);
    sg.fillRect(0, 0, side, side);
    sg.globalAlpha = 1;
  }
  // Note: dust drifts across the line of fire unless motion is reduced.
  if (!look.calm) {
    const r = seeded((look.seed || 1) ^ 0x51ed);
    for (let i = 0; i < 7; i++) {
      const x = (r() * ART + (view.time || 0) * (2 + i)) % ART;
      p.cell(Math.floor(x), Math.floor(layers.hz - 6 + r() * 30), 1, 1, C.PLASTER_L);
    }
  }
  layers.paint(sg, 'front');
  const tip = sightAt(side, distance, view.sights);
  const tx = Math.round(tip.x * dpr) / dpr;
  const ty = Math.round(tip.y * dpr) / dpr;
  paintSights(sg, tx, ty, !!view.hammer?.cocked || !!view.hammer?.cocking, side / SIGHT.ref);

  sg.restore();
  sg.lineWidth = 4;
  sg.strokeStyle = BRASS;
  sg.beginPath();
  sg.arc(c, c, c - 2, 0, Math.PI * 2);
  sg.stroke();
  sg.lineWidth = 1;
  sg.strokeStyle = BRASS_L;
  sg.beginPath();
  sg.arc(c, c, c - 3.5, 0, Math.PI * 2);
  sg.stroke();
  sg.lineWidth = 1;
  sg.strokeStyle = INK;
  sg.beginPath();
  sg.arc(c, c, c - 0.5, 0, Math.PI * 2);
  sg.stroke();
  return { foe: { x: c, y: ground }, tip: { x: tx, y: ty }, scale };
}

// Note: the two rings of the aim over the sight picture, in a square of side device pixels laid exactly on the ring (geom is { side, px, distance }, px device pixels to a CSS pixel): the outer ring is where the sights point, on the blade's tip, and the inner ring is the mouse, both in metres on the foe at the picture's scale; the outer ring turns brass once the rings are aligned.
export function paintAim(ag, view, geom) {
  const { side, px, distance = 10 } = geom;
  const { inner, outer, aligned } = view.rings;
  const scale = sightScale(side, distance);
  const at = (aim) => sightAt(side, distance, aim);
  const ring = (p, radius, width, color) => {
    ag.beginPath();
    ag.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ag.lineWidth = width;
    ag.strokeStyle = color;
    ag.stroke();
  };
  ag.clearRect(0, 0, side, side);
  const o = at(outer);
  ring(o, RING.outer * scale, 4 * px, INK);
  ring(o, RING.outer * scale, 2 * px, aligned ? BRASS_L : 'rgba(244, 232, 200, 0.85)');
  const i = at(inner);
  ring(i, RING.inner * scale, 3 * px, INK);
  ring(i, RING.inner * scale, 1.5 * px, '#fff6cf');
}
