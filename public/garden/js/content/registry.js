// Note: leaf registries for the Garden endgame content; this file imports nothing and content files must never import models.js.
// Note: LANDMARK_KITS[id] = (c, B, C) => void builds a whole non-tiered building (landmarks, airdock, memorial, greatwork site) into the Ctx c.
// Note: c is models.js Ctx (c.id, c.v 0..3, c.d 0/1, c.g, c.ud, c.mesh(name, build, mat, parent), c.glow(x, y, z, col), c.smoke); B is the geometry builder class, C the palette.
// Note: before the first build the integrator runs Object.assign(ENV, { MATS, GOLD, FLAG_COLS, gable, plinth, Vector3, Group }) once in models.js; kits call kitEnv(c) for lit, lamp, plume, sway, pivot.
// Note: seed variants: v = seed & 3, d = (seed >> 2) & 1; the memorial deed index is v (DEED_INDEX); all variation is a pure function of (v, d).
// Note: GOOD_MODELS[id] = { crate(b, C, col), pile(b, n, C, col, rnd) } add parts into an existing builder b; the caller creates and builds b (crate bottom at y 0, about 0.3 wide).
// Note: SHIP_MODELS[kind] = (B, C) => { body, glow, flag: { geo, pos }, prop: { geo, pos }, lamps, slots, height }; bow +z, y 0 gondola floor, prop spins about z; makeShip(kind) in models.js wraps them.
// Note: SPIRE.buildStage(stage, B, C) returns { body, glow } for one Great Work piece in building-local coordinates: 0 foundation and shaft, 1..6 goods, 7 crown.
export const LANDMARK_KITS = {};
export const GOOD_MODELS = {};
export const SHIP_MODELS = {};
export const SPIRE = {};

// Note: roof palettes copied from models.js so kits stay in the same colour family.
export const ROOF = [0xdb8a6c, 0x84b39c, 0x8aa8cb, 0xc48ca8];
export const DARKROOF = [0x7f8fa3, 0x8b7a7e, 0x6f8f86, 0xa0705f];
export const BRASS = 0xd1a248;
export const BRASS_D = 0xa8803a;
export const DEED_INDEX = { bridge: 0, master: 1, parent: 2, hero: 3, ambassador: 3 };

// Note: filled once by models.js with the render-side helpers kits may not import.
export const ENV = {};

// Note: builds the helper object X of a kit for one Ctx from ENV.
export function kitEnv(c) {
  const { MATS, Vector3, Group } = ENV;
  return {
    MATS, GOLD: ENV.GOLD, FLAG_COLS: ENV.FLAG_COLS, gable: ENV.gable, plinth: ENV.plinth,
    // Note: self-lit mesh, vertex colours drawn at full brightness (also at night).
    lit: (name, build, parent) => c.mesh(name, build, MATS.glow, parent),
    // Note: translucent glass mesh.
    glass: (name, build, parent) => c.mesh(name, build, MATS.glass, parent),
    // Note: a point for the light pool, flickers in the view; keep to 2 per building.
    lamp: (x, y, z) => { (c.ud.lamps ||= []).push(new Vector3(x, y, z)); },
    // Note: chimney smoke point.
    plume: (x, y, z) => { (c.ud.plumes ||= []).push(new Vector3(x, y, z)); },
    // Note: chained per-frame update (time, wind).
    sway: (fn) => { const prev = c.ud.update; c.ud.update = (time, wind) => { if (prev) prev(time, wind); fn(time, wind); }; },
    // Note: empty pivot group at (x, y, z) inside the building group; parent of a mesh that swings or spins.
    pivot: (x, y, z) => { const g = new Group(); g.position.set(x, y, z); c.g.add(g); return g; },
    // Note: legacy spin group (rotates about z with the wind); one per building.
    spin: (g) => { c.ud.spin = g; },
  };
}

// Note: polar point from the +z axis, theta toward +x; returns [x, z].
export const pol = (r, deg) => [r * Math.sin((deg * Math.PI) / 180), r * Math.cos((deg * Math.PI) / 180)];
