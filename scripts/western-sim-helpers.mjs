// Note: shared fixtures of the tactical simulation tests (western, western-carry and western-flight); no camp module is imported.
import assert from 'node:assert/strict';

export const js = (name) => import(new URL(`../public/western/js/${name}.js`, import.meta.url));

const { Sim } = await js('sim');
const { T } = await js('tiles');
const { makeMap, newFloor, setTile, tileAt } = await js('map');
const { rng, seedFromString } = await js('rand');
const { STEP } = await js('config');
const { applyHit } = await js('wounds');
const { makeShaft } = await js('los');
const { flightOf } = await js('nav');
const { snapshot } = await js('tactical-memory');
const { makeMind, observeThreat } = await js('mind');


// Note: a copy of briefTacticalParty from western-test-helpers.mjs, whose import pulls in the camp modules and costs half a second of CPU.
export function briefTacticalParty(sim) {
  for (const deputy of sim.deputies) {
    deputy.ai.people = new Map(sim.lawmen.filter((a) => a !== deputy).map((a) => [a.id, snapshot(a, sim.time)]));
    deputy.ai.mind = makeMind();
    for (const hostile of sim.hostiles.filter((h) => h.status === 'ok')) observeThreat(deputy.ai.mind,
      { id: hostile.id, x: hostile.x, y: hostile.y, f: hostile.floor, t: sim.time, src: 'report', conf: 0.8 });
  }
}

// Note: scenario tests run on a bare arena so each rule is checked alone; the carry tests use real houses.
export const combatRand = (seed) => {
  const r = rng(seedFromString(`combat:${seed}`));
  return () => r.next();
};

// Note: the default wall tile is the floor already there, so no wall is built unless asked for.
export function arena({ seed = 'TOMBSTONE-1', hostiles = 1, wall = T.FLOOR } = {}) {
  const sim = new Sim(seed, { rand: combatRand(seed) });
  const map = makeMap([newFloor(T.FLOOR), newFloor(T.FLOOR)]);
  for (let i = 0; i < 40; i++) for (const [x, y] of [[i, 0], [i, 29], [0, i % 30], [39, i % 30]]) setTile(map, 0, x, y, T.ADOBE);
  for (let y = 5; y < 25; y++) setTile(map, 0, 20, y, wall);
  sim.map = map;
  for (const h of sim.hostiles.slice(hostiles)) {
    sim.actors.splice(sim.actors.indexOf(h), 1);
  }
  sim.hostiles = sim.hostiles.slice(0, hostiles);
  sim.actors.splice(0, sim.actors.length, ...sim.actors.filter((a) => a !== sim.civilian));
  sim.civilian = null;
  return sim;
}

export function put(sim, a, x, y, facing = 0, floor = 0) {
  a.x = x;
  a.y = y;
  a.floor = floor;
  a.facing = facing;
  a.home = { x, y, floor };
  a.nav = null;
  sim.updateEye(a);
  return a;
}

// Note: the first tick carries the input as given; later ticks only hold the keys.
export const run = (sim, seconds, input = {}) => {
  const held = { ...input, interact: false, command: 0, toggleSignal: false, toggleSprint: false, toggleSlow: false };
  let next = input;
  for (let i = 0; i < seconds / STEP; i++) {
    sim.tick(next);
    next = held;
  }
};
// Note: the even-odd rule over the edges of a polygon of [x, y] points.
export const inPoly = (poly, x, y) => poly.filter(([ax, ay], i) => {
  const [bx, by] = poly[(i + poly.length - 1) % poly.length];
  return ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax;
}).length % 2 === 1;
export const runUntil = (sim, pred, max = 60) => {
  for (let i = 0; i < max / STEP && !pred(); i++) sim.tick({});
  return pred();
};
export const bulletsFly = (sim, ticks = 90) => {
  for (let i = 0; i < ticks; i++) sim.stepBullets();
};
export const shoot = (sim, a, opts = {}) => {
  sim.input = {};
  a.weapons[a.cur].cool = 0;
  const ok = sim.tryFire(a, { aimDist: 8, ...opts });
  bulletsFly(sim);
  return ok;
};
export const hostile = (sim) => sim.hostiles[0];
export const hits = (sim) => sim.events.filter((e) => e.type === 'hit');
export const wound = (a, sim, region = 'abdomen') => applyHit(a, { region, side: 0 }, 700, () => 0.5, sim.time);

export const snapOf = (h) => JSON.stringify({
  style: h.style, footprint: h.footprint, rooms: h.rooms, entries: h.entries.map((e) => [e.kind, e.x, e.y]),
  hostiles: h.hostiles, civilian: h.civilian,
  tiles: h.map.floors.map((f) => Array.from(f.tile)), states: h.map.floors.map((f) => Array.from(f.state)),
});

// Note: a bare two-floor arena with the flight at x 20, y 14-15: foot landing (20, 16) on floor 0, head landing (20, 13) on floor 1; rails close the east side and the far ends, a partition the west side.
export function stairArena() {
  const sim = arena();
  const stairs = { x: 20, y: 15, run: { x: 20, y: 14 }, foot: { x: 20, y: 16 }, head: { x: 20, y: 13 } };
  for (let f = 0; f < 2; f++) {
    setTile(sim.map, f, 20, 15, T.STAIRS);
    setTile(sim.map, f, 20, 14, T.RUN);
    for (const y of [14, 15]) {
      setTile(sim.map, f, 19, y, T.PARTITION);
      setTile(sim.map, f, 21, y, T.RAIL);
    }
  }
  setTile(sim.map, 0, 20, 13, T.RAIL);
  setTile(sim.map, 1, 20, 16, T.RAIL);
  sim.house = { ...sim.house, stairs };
  sim.shaft = makeShaft(stairs);
  const d = sim.deputy;
  put(sim, d, 5.5, 5.5);
  d.thinkT = 1e9;
  d.intent = { move: null };
  const h = hostile(sim);
  h.thinkT = 1e9;
  h.intent = { move: null };
  return sim;
}

// Note: stands the actor on the flight at row y, as if it had walked there.
export const climb = (sim, a, y, facing = -Math.PI / 2) => {
  put(sim, a, 20.5, y, facing);
  sim.settleFlight(a);
  sim.updateEye(a);
  return a;
};
export const UP = { move: { x: 0, y: -1 }, aim: { x: 20.5, y: 5 } };
export const DOWN = { move: { x: 0, y: 1 }, aim: { x: 20.5, y: 25 } };

// Note: a crouching hostile on the head landing at (20.713, 12.556) and a standing sheriff at (19.844, 16.547) below, a state found by random search.
export function crouchedAbove() {
  const sim = stairArena(), s = sim.sheriff, h = hostile(sim);
  put(sim, s, 19.84406606242992, 16.546905799768865, -Math.PI / 2);
  put(sim, h, 20.71299375854433, 12.555774556216784, Math.PI / 2, 1);
  h.stance = 'crouch';
  sim.updateEye(h);
  sim.rand = () => 0.25;
  return { sim, s, h };
}

// Note: kills through the wound model, so the status change runs the same path as a real death.
export function applyKill(sim, a) {
  a.wounds.push({ region: 'head', bleed: 1, severity: 1, fatal: true, severe: true, t: sim.time });
  a.status = 'dead';
  sim.onStatus(a);
}

// Note: whoever is up on the flight stands in one of its cells at the height their position gives; nobody floats, and nobody downed is up there unless a carrier has them on his shoulders.
export function flightInvariant(sim, seed) {
  for (const a of sim.actors.filter((actor) => actor.elev)) {
    const t = tileAt(sim.map, a.floor, Math.floor(a.x), Math.floor(a.y));
    assert.ok(t === T.STAIRS || t === T.RUN, `${seed} t=${sim.time.toFixed(2)} ${a.role} floats (elev ${a.elev.toFixed(2)}) over tile ${t}`);
    const fl = flightOf(sim.map, a.floor, Math.floor(a.x), Math.floor(a.y));
    const z = (3 * (fl.sy + 1 - a.y)) / 2;
    assert.ok(Math.abs(a.floor * 3 + a.elev - z) < 1e-6, `${seed} ${a.role} height does not match position`);
    assert.ok(a.status === 'ok' || a.carried, `${seed} ${a.role} lies on the flight`);
  }
}
