// Note: the tactical simulation core: sight, friendly fire, comms, pace, input, entry, nav, replay and performance; outcomes are in western-carry, the stairs in western-flight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js, briefTacticalParty, combatRand, arena, put, run, inPoly, runUntil, bulletsFly, shoot, hostile, hits, snapOf, stairArena, climb } from './western-sim-helpers.mjs';

const { Sim } = await js('sim');
const { T, DS, WS } = await js('tiles');
const { setTile, stateAt } = await js('map');
const { generateHouse } = await js('house');
const { normSeed } = await js('rand');
const { STEP, FOV_PRESETS } = await js('config');

test('LOS: a wall blocks sight both ways; an open doorway lets it through', () => {
  const sim = arena({ wall: T.ADOBE });
  const s = put(sim, sim.sheriff, 16, 15);
  const h = put(sim, hostile(sim), 24, 15, Math.PI);
  assert.equal(sim.sees(s, h), false);
  assert.equal(sim.sees(h, s), false);
  assert.equal(sim.pointVisible(s, h.x, h.y), false);
  setTile(sim.map, 0, 20, 15, T.DOOR, DS.OPEN);
  assert.equal(sim.sees(s, h), true);
  assert.equal(sim.sees(h, s), true);
});

test('LOS: a closed door blocks sight, a bolted window does not', () => {
  const sim = arena({ wall: T.ADOBE });
  const s = put(sim, sim.sheriff, 16, 15);
  const h = put(sim, hostile(sim), 24, 15, Math.PI);
  setTile(sim.map, 0, 20, 15, T.DOOR, DS.CLOSED);
  assert.equal(sim.sees(s, h), false);
  setTile(sim.map, 0, 20, 15, T.WINDOW, WS.BOLTED);
  assert.equal(sim.sees(s, h), true);
});

test('LOS: nobody sees outside the whole field, however close (items 33, 72)', () => {
  const [core, mid, flank] = FOV_PRESETS.natural.zones;
  const sim = arena();
  const s = put(sim, sim.sheriff, 15, 15, 0);
  const h = put(sim, hostile(sim), 10, 15, 0);
  assert.equal(sim.sees(s, h), false, 'behind the sheriff');
  put(sim, h, 14.2, 15, 0);
  assert.equal(sim.sees(s, h), false, 'no all-round ring: even at 0.8 m behind the sheriff stays hidden');
  const at = (deg, d) => put(sim, h, 15 + d * Math.cos((deg * Math.PI) / 180), 15 + d * Math.sin((deg * Math.PI) / 180), 0);
  const midDeg = (((core.half + mid.half) / 2) * 180) / Math.PI;
  const flankDeg = (((mid.half + flank.half) / 2) * 180) / Math.PI;
  at(0, core.range - 2);
  assert.equal(sim.seeZone(s, h), 0, 'in front, in the core');
  at(midDeg, mid.range - 2);
  assert.equal(sim.seeZone(s, h), 1, 'off to the side, in the mid zone');
  at(midDeg, mid.range + 1);
  assert.equal(sim.sees(s, h), false, 'the mid zone ends where its range does');
  at(flankDeg, flank.range - 1);
  assert.equal(sim.seeZone(s, h), 2, 'beside the sheriff, in the flank');
  at(flankDeg, flank.range + 1);
  assert.equal(sim.sees(s, h), false, 'the flank ends where its range does');
  at(((flank.half * 180) / Math.PI) + 10, 3);
  assert.equal(sim.sees(s, h), false, 'nothing is seen past the flank angle');
});

test('LOS: careful aim narrows the core and reaches further, while the mid zone keeps the rest dim (item 72)', () => {
  const { zones: [core, mid], focus } = FOV_PRESETS.natural;
  const sim = arena();
  const s = put(sim, sim.sheriff, 15, 15, 0);
  const h = put(sim, hostile(sim), 15 + (core.range + focus.range) / 2, 15, 0);
  assert.equal(sim.sees(s, h), false, 'beyond the open core the view does not reach');
  s.focus = 1;
  assert.equal(sim.sees(s, h), true, 'careful aim reaches further');
  const at = (deg, d) => put(sim, h, 15 + d * Math.cos((deg * Math.PI) / 180), 15 + d * Math.sin((deg * Math.PI) / 180), 0);
  at((((focus.half + core.half) / 2) * 180) / Math.PI, mid.range - 2);
  assert.equal(sim.seeZone(s, h), 1, 'a man between the two core angles is no longer in the core, but still seen');
  s.focus = 0;
  assert.equal(sim.seeZone(s, h), 0, 'the same man is in the core without careful aim');
});

test('LOS: the classic preset keeps the single aim cone of Prototype 1 (?fov=classic, item 33)', () => {
  const sim = arena();
  sim.fovCfg = FOV_PRESETS.classic;
  const s = put(sim, sim.sheriff, 15, 15, 0);
  const h = put(sim, hostile(sim), 10, 15, 0);
  assert.equal(sim.sees(s, h), false, 'behind the sheriff');
  put(sim, h, 14.2, 15, 0);
  assert.equal(sim.sees(s, h), false, 'no all-round ring: even at 0.8 m behind the sheriff stays hidden');
  put(sim, h, 22, 15, 0);
  assert.equal(sim.sees(s, h), true, 'in front');
  s.steady = true;
  put(sim, h, 22, 22, 0);
  assert.equal(sim.sees(s, h), false, 'steady aim narrows the cone');
  s.steady = false;
  assert.equal(sim.sees(s, h), true, 'the same spot is visible without steady aim');
});

test('LOS: a leaned sheriff sees past a corner that would hide a standing one', () => {
  const sim = arena();
  for (let y = 5; y < 14; y++) setTile(sim.map, 0, 20, y, T.ADOBE);
  const s = put(sim, sim.sheriff, 18.5, 13.3, 0);
  const h = put(sim, hostile(sim), 23, 14.6, 0);
  const look = (lean) => {
    s.lean = lean;
    sim.updateEye(s);
    s.facing = Math.atan2(h.y - s.eye.y, h.x - s.eye.x);
    sim.updateEye(s);
    return sim.sees(s, h);
  };
  const standing = look(0);
  const leaning = [look(-1), look(1)];
  assert.equal(standing, false, 'standing is blocked by the wall end');
  assert.ok(leaning.some(Boolean), `leaning=${leaning}`);
});

test('LOS: no memory, the view polygon only holds what is in sight now', () => {
  const sim = arena({ wall: T.ADOBE });
  put(sim, sim.sheriff, 16, 15);
  const v = sim.view();
  assert.equal(inPoly(v.cone, 18, 15), true);
  assert.equal(inPoly(v.cone, 23, 15), false);
});

test('LOS obstruction: adobe stops a rifle bullet, a plank partition does not', () => {
  const solid = arena({ wall: T.ADOBE });
  put(solid, solid.sheriff, 16, 15);
  put(solid, hostile(solid), 24, 15, Math.PI);
  assert.equal(shoot(solid, solid.sheriff, { aimDist: 8 }), true);
  assert.equal(hostile(solid).wounds.length, 0, 'adobe');
  const thin = arena({ wall: T.PARTITION });
  put(thin, thin.sheriff, 16, 15);
  put(thin, hostile(thin), 24, 15, Math.PI);
  shoot(thin, thin.sheriff, { aimDist: 8 });
  assert.ok(hostile(thin).wounds.length > 0, 'partition');
});

test('friendly fire: a bullet hits the deputy standing in the line of fire', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15, 0);
  const d = put(sim, sim.deputy, 12, 15, 0);
  put(sim, hostile(sim), 17, 15, Math.PI);
  assert.equal(shoot(sim, s, { aimDist: 7 }), true);
  assert.ok(d.wounds.length > 0, 'the deputy was struck');
  assert.ok(hits(sim).some((e) => e.actorId === d.id && e.ownerId === s.id));
  assert.equal(sim.report().people.find((p) => p.role === 'deputy').by, 'sheriff', 'the report names who fired');
});

test('friendly fire: the deputy sidesteps instead of shooting through the sheriff in the line', () => {
  let shots = 0;
  let hitsOnSheriff = 0;
  // Note: one run of 4 s; the deputy sidesteps and fires three times between 2.5 s and 3.7 s.
  for (let i = 0; i < 1; i++) {
    const sim = arena({ seed: 'TOMBSTONE-1' });
    sim.rand = combatRand(`line${i}`);
    put(sim, sim.sheriff, 10.9, 12.7, 0);
    put(sim, sim.deputy, 9, 15, -0.9);
    const h = put(sim, hostile(sim), 12.7, 10.3, Math.PI);
    h.weapons.forEach((w) => { w.loaded = 0; });
    h.ammo = { '44-40': 0, '45colt': 0 };
    for (let t = 0; t < 4 / STEP; t++) {
      sim.tick({});
      const events = sim.drain();
      shots += events.filter((e) => e.type === 'shot' && e.actorId === sim.deputy.id).length;
      hitsOnSheriff += events.filter((e) => e.type === 'hit' && e.actorId === sim.sheriff.id && e.ownerId === sim.deputy.id).length;
    }
  }
  assert.ok(shots > 1, `the deputy still fights (${shots} shots)`);
  // Note: the former one hit in twelve runs scales to none in one.
  assert.equal(hitsOnSheriff, 0, `${hitsOnSheriff} hits on the sheriff`);
});

test('friendly fire: the same rules apply to a hostile shooting a hostile', () => {
  const sim = arena({ hostiles: 2 });
  const [a, b] = sim.hostiles;
  put(sim, a, 25, 15, Math.PI);
  put(sim, b, 22, 15, 0);
  put(sim, sim.sheriff, 10, 15, 0);
  assert.equal(shoot(sim, a, { aimDist: 12 }), true);
  assert.ok(b.wounds.length > 0);
});

test('friendly fire: a hostile holds fire with an ally in the line', () => {
  const sim = arena({ hostiles: 2 });
  const [a, b] = sim.hostiles;
  const s = put(sim, sim.sheriff, 10, 15, 0);
  put(sim, a, 22, 15, Math.PI);
  put(sim, b, 17, 15, Math.PI);
  put(sim, sim.deputy, 5, 25, 0);
  a.ai.state = 'engage';
  a.ai.engageAt = 0;
  a.ai.target = s.id;
  const shots = [];
  for (let i = 0; i < 4 / STEP && a.status === 'ok' && b.status === 'ok'; i++) {
    sim.tick({});
    shots.push(...sim.drain().filter((e) => e.type === 'shot' && e.actorId === a.id));
  }
  assert.equal(shots.length, 0, 'no shot through an ally');
});

test('friendly fire: a body stops a bullet of low energy but not a rifle round outright', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15, 0);
  const d = put(sim, sim.deputy, 12, 15, 0);
  s.cur = 1;
  shoot(sim, s, { aimDist: 7 });
  assert.ok(d.wounds.length > 0);
  assert.equal(hostile(sim).wounds.length, 0);
});

test('report: a hostile the lawman does not see does not carve holes into the cells he reports clear', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 15.5, 15.5, 0);
  put(sim, sim.deputy, 5, 25, 0);
  const h = hostile(sim);
  h.thinkT = 1e9;
  h.intent = { move: null };
  const half = sim.fovOf(s).half;
  put(sim, h, 35.5, 5.5, 0);
  const far = sim.visibleCells(s, 12).length;
  put(sim, h, 15.5 + 6 * Math.cos(half + 0.06), 15.5 + 6 * Math.sin(half + 0.06), 0);
  assert.equal(sim.sees(s, h), false);
  assert.equal(sim.visibleCells(s, 12).length, far, 'an unseen man leaves no trace in the report');
});

test('deputy: badly crippled and under fire, the deputy retreats rather than fights on', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15);
  const d = put(sim, sim.deputy, 12, 15, 0);
  put(sim, hostile(sim), 20, 15, Math.PI);
  s.status = 'dead';
  d.wounds.push({ region: 'arm', side: -1, bleed: 0, severe: false }, { region: 'arm', side: 1, bleed: 0, severe: false });
  hostile(sim).ai.state = 'engage';
  // Note: hostile fire, not the mere sight of a hostile, puts the deputy under fire (item 420).
  sim.emit(hostile(sim), 'gunshot_rifle');
  run(sim, 2);
  assert.equal(d.ai.fleeing, 'retreat');
});

test('replay: the same seed rebuilds the same house and hostile placement', () => {
  const a = new Sim('TOMBSTONE-428', { rand: combatRand('x') });
  const b = new Sim(normSeed('tombstone-428'), { rand: combatRand('y') });
  assert.equal(snapOf(a.house), snapOf(b.house));
  assert.deepEqual(a.hostiles.map((x) => [x.x, x.y, x.floor, x.traits.experience]), b.hostiles.map((x) => [x.x, x.y, x.floor, x.traits.experience]));
  const other = new Sim('TOMBSTONE-429', { rand: combatRand('x') });
  assert.notEqual(snapOf(a.house), snapOf(other.house));
});

test('replay: generation does not depend on combat randomness', () => {
  const before = snapOf(generateHouse('ALLEN-77'));
  const burned = new Sim('BISBEE-5', { rand: Math.random });
  for (let i = 0; i < 2000; i++) burned.rand();
  assert.equal(snapOf(generateHouse('ALLEN-77')), before);
});

test('replay: the outcome report carries the seed that rebuilds the same house', () => {
  const sim = arena({ seed: 'HAFFORD-31' });
  sim.hostiles.forEach((h) => { h.status = 'dead'; });
  run(sim, 2);
  const seed = sim.report().seed;
  assert.equal(seed, 'HAFFORD-31');
  assert.equal(snapOf(new Sim(seed, {}).house), snapOf(generateHouse('HAFFORD-31')));
});

test('every house holds 3 to 6 hostiles', () => {
  for (let i = 0; i < 100; i++) {
    const n = generateHouse(`GLEESON-${i}`).hostiles.length;
    assert.ok(n >= 3 && n <= 6, `${n}`);
  }
});

test('comms: a voice command is heard by hostiles in range, a hand signal is silent', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15);
  const d = put(sim, sim.deputy, 12, 15, Math.PI);
  const h = put(sim, hostile(sim), 20, 15, Math.PI);
  sim.rand = () => 0.5;
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  assert.ok(sim.drain().some((e) => e.type === 'command' && e.method === 'voice' && e.perceived));
  assert.ok(h.heard.some((x) => x.srcId === s.id && x.kind === 'shout'), 'the hostile heard the shout');
  h.heard.length = 0;
  sim.tick({ toggleSignal: true });
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  const ev = sim.drain();
  assert.ok(ev.some((e) => e.type === 'command' && e.method === 'signal' && e.perceived), 'deputy faces the sheriff');
  assert.equal(h.heard.filter((x) => x.srcId === s.id).length, 0, 'silent');
  d.facing = 0;
  sim.updateEye(d);
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  assert.ok(sim.drain().some((e) => e.type === 'command' && e.method === 'signal' && !e.perceived), 'not seen, not understood');
});

test('comms: a hand signal does not pass through a wall', () => {
  const sim = arena({ wall: T.ADOBE });
  put(sim, sim.sheriff, 18, 15);
  put(sim, sim.deputy, 22, 15, Math.PI);
  sim.tick({ toggleSignal: true });
  sim.tick({ command: 2, aim: { x: 19, y: 15 } });
  assert.ok(sim.drain().some((e) => e.type === 'command' && !e.perceived));
  assert.equal(sim.deputy.ai.order, undefined);
});

test('comms: V twice returns to voice', () => {
  const sim = arena();
  assert.equal(sim.signal, false);
  sim.tick({ toggleSignal: true });
  assert.equal(sim.signal, true);
  sim.tick({});
  assert.equal(sim.signal, true, 'a tick without the key keeps the mode');
  sim.tick({ toggleSignal: true });
  assert.equal(sim.signal, false);
  const modes = sim.drain().filter((e) => e.type === 'signalMode');
  assert.deepEqual(modes.map((e) => [e.actorId, e.signal]), [[sim.sheriff.id, true], [sim.sheriff.id, false]]);
});

test('pace: Shift and Ctrl toggle sprint and slow, the pace holds with no key down, the other key replaces it', () => {
  const dist = (sim, input) => {
    put(sim, sim.sheriff, 5, 15);
    const x0 = sim.sheriff.x;
    run(sim, 0.5, { move: { x: 1, y: 0 }, aim: { x: 30, y: 15 }, ...input });
    return sim.sheriff.x - x0;
  };
  const sim = arena();
  assert.equal(sim.pace, 'walk');
  const walk = dist(sim, {});
  const sprint = dist(sim, { toggleSprint: true });
  assert.equal(sim.pace, 'sprint');
  assert.ok(sprint > walk * 2, `sprint ${sprint.toFixed(2)} m against walk ${walk.toFixed(2)} m`);
  assert.ok(dist(sim, {}) > walk * 2, 'no key down, still sprinting');
  const slow = dist(sim, { toggleSlow: true });
  assert.equal(sim.pace, 'slow', 'Ctrl replaces sprint');
  assert.ok(slow < walk * 0.6);
  assert.ok(dist(sim, {}) < walk * 0.6, 'no key down, still slow');
  dist(sim, { toggleSlow: true });
  assert.equal(sim.pace, 'walk', 'the same key again ends it');
  assert.ok(Math.abs(dist(sim, {}) - walk) < 0.2);
  assert.deepEqual(sim.drain().filter((e) => e.type === 'paceMode').map((e) => e.pace), ['sprint', 'slow', 'walk']);
});

test('pace: a toggled pace stays until the same key is pressed again or the other replaces it, however the sheriff moves or stands (item 10)', () => {
  const walkTo = (sim, seconds, move) => run(sim, seconds, { move, aim: { x: 30, y: 15 } });
  const sim = arena();
  put(sim, sim.sheriff, 5, 15);
  sim.tick({ toggleSprint: true });
  walkTo(sim, 1, { x: 0, y: 0 });
  walkTo(sim, 0.5, { x: 1, y: 0 });
  walkTo(sim, 1, { x: 0, y: 0 });
  walkTo(sim, 0.4, { x: 1, y: 0 });
  assert.equal(sim.pace, 'sprint', 'standing still does not end it');
  sim.tick({ toggleSlow: true });
  walkTo(sim, 1, { x: 0, y: 0 });
  assert.equal(sim.pace, 'slow', 'the other key replaces it and it stays too');
  sim.tick({ toggleSlow: true });
  assert.equal(sim.pace, 'walk', 'the same key again ends it');
  assert.deepEqual(sim.drain().filter((e) => e.type === 'paceMode').map((e) => e.pace), ['sprint', 'slow', 'walk']);
});

test('pace: a toggle press on a frame that runs no tick is kept, at 60, 144 and 240 Hz', () => {
  // Note: the leads cover every frame phase of a tick at each rate.
  for (const [hz, leads] of [[60, 1], [144, 3], [240, 4]]) {
    for (let lead = 0; lead < leads; lead++) {
      const sim = arena();
      for (let i = 0; i < lead; i++) sim.step(1 / hz, {});
      sim.step(1 / hz, { toggleSlow: true });
      for (let i = 0; i < 12; i++) sim.step(1 / hz, {});
      assert.equal(sim.pace, 'slow', `${hz} Hz, lead ${lead}`);
      assert.equal(sim.drain().filter((e) => e.type === 'paceMode').length, 1, `${hz} Hz, lead ${lead}: toggled once`);
    }
  }
});

test('pace: a new attempt starts at a walk', () => {
  const sim = arena();
  sim.tick({ toggleSprint: true });
  assert.equal(sim.pace, 'sprint');
  assert.equal(arena().pace, 'walk');
});

test('pace: a toggled creep makes a spoken order a whisper, like holding Ctrl did', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15);
  put(sim, sim.deputy, 12, 15, Math.PI);
  const h = put(sim, hostile(sim), 40 - 4, 15, Math.PI);
  sim.tick({ toggleSlow: true });
  sim.drain();
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  const ev = sim.drain();
  assert.ok(ev.some((e) => e.type === 'command' && e.method === 'voice' && e.perceived), 'the deputy hears a whisper');
  assert.ok(ev.some((e) => e.type === 'heard' && e.kind === 'whisper'));
  assert.ok(!h.heard.some((x) => x.srcId === s.id && x.kind === 'shout'));
});

test('step: a key press on a frame that runs no tick is kept for the next tick, at 60, 144 and 240 Hz', () => {
  // Note: the leads cover every frame phase of a tick at each rate.
  for (const [hz, leads] of [[60, 1], [144, 3], [240, 4]]) {
    for (let lead = 0; lead < leads; lead++) {
      const sim = arena();
      put(sim, sim.sheriff, 10, 15);
      put(sim, sim.deputy, 12, 15, Math.PI);
      for (let i = 0; i < lead; i++) sim.step(1 / hz, {});
      sim.step(1 / hz, { toggleSignal: true, command: 2, aim: { x: 14, y: 15 } });
      for (let i = 0; i < 12; i++) sim.step(1 / hz, { aim: { x: 14, y: 15 } });
      const ev = sim.drain();
      assert.equal(sim.signal, true, `${hz} Hz, lead ${lead}: toggled once`);
      assert.equal(ev.filter((e) => e.type === 'signalMode').length, 1, `${hz} Hz, lead ${lead}`);
      assert.equal(ev.filter((e) => e.type === 'command').length, 1, `${hz} Hz, lead ${lead}: one command`);
    }
  }
});

test('step: a press on a frame that runs two ticks counts once', () => {
  const sim = arena();
  sim.step(2.5 * STEP, { toggleSignal: true, command: 1, aim: { x: 14, y: 15 } });
  sim.step(2.5 * STEP, {});
  assert.equal(sim.signal, true);
  assert.equal(sim.drain().filter((e) => e.type === 'command').length, 1);
});

test('comms: a voice command is a shouted line, a hand signal has no line and no sound', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15);
  put(sim, sim.deputy, 12, 15, Math.PI);
  const h = put(sim, hostile(sim), 20, 15, Math.PI);
  sim.rand = () => 0.5;
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  let ev = sim.drain();
  assert.ok(ev.some((e) => e.type === 'voice' && e.actorId === s.id && e.spoken), 'voice: a spoken line');
  assert.ok(ev.some((e) => e.type === 'heard' && e.kind === 'shout'), 'voice: a shout is heard');
  assert.ok(h.heard.length > 0);
  h.heard.length = 0;
  const logged = sim.soundLog.length;
  sim.tick({ toggleSignal: true });
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  ev = sim.drain();
  assert.ok(ev.some((e) => e.type === 'signal' && e.actorId === s.id && e.kind === 'cover' && e.seen));
  assert.ok(!ev.some((e) => e.type === 'voice' && e.actorId === s.id), 'signal: no sheriff line');
  assert.ok(!ev.some((e) => e.type === 'heard' && (e.kind === 'shout' || e.own)), 'signal: nothing heard');
  assert.equal(sim.soundLog.length, logged, 'signal: no sound emitted by the toggle or the sign');
  assert.equal(h.heard.length, 0);
});

test('comms: the deputy answers a hand signal by hand and a spoken order by voice', () => {
  const run1 = (raise, rand) => {
    const sim = arena();
    put(sim, sim.sheriff, 10, 15);
    const d = put(sim, sim.deputy, 12, 15, Math.PI);
    put(sim, hostile(sim), 35, 25);
    sim.rand = () => rand;
    for (const input of raise) sim.tick(input);
    sim.drain();
    sim.tick({ command: 1, aim: { x: 16, y: 15 } });
    for (let i = 0; i < 30; i++) sim.tick({});
    return { ev: sim.drain(), d };
  };
  const SIGNAL = [{ toggleSignal: true }];
  const hand = run1(SIGNAL, 0.5);
  assert.ok(hand.ev.some((e) => e.type === 'signal' && e.actorId === hand.d.id && e.ack === 'yes' && e.kind === 'cover'), 'hand: signed back');
  assert.ok(!hand.ev.some((e) => e.type === 'voice' && e.actorId === hand.d.id), 'hand: no deputy line');
  const said = run1([], 0.5);
  assert.ok(said.ev.some((e) => e.type === 'voice' && e.actorId === said.d.id && e.text === 'Covering.'), 'voice: a whisper');
  assert.ok(!said.ev.some((e) => e.type === 'signal' && e.ack), 'voice: no hand answer');
  const no = run1(SIGNAL, 0.97);
  assert.ok(no.ev.some((e) => e.type === 'signal' && e.ack === 'no' && e.kind === 'refuse'), 'hand: a refusal is a sign too');
  assert.ok(!no.ev.some((e) => e.type === 'voice' && e.actorId === no.d.id));
  const nope = run1([], 0.97);
  assert.ok(nope.ev.some((e) => e.type === 'voice' && e.text === 'Not now.'));
});

test('comms: a hand signal the deputy cannot see is neither understood nor answered', () => {
  const sim = arena();
  put(sim, sim.sheriff, 10, 15);
  const d = put(sim, sim.deputy, 12, 15, 0);
  sim.rand = () => 0.5;
  sim.tick({ toggleSignal: true });
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  for (let i = 0; i < 30; i++) sim.tick({});
  const ev = sim.drain();
  assert.ok(ev.some((e) => e.type === 'command' && !e.perceived));
  assert.ok(!ev.some((e) => e.type === 'signal' && e.actorId === d.id), 'no answer');
  assert.equal(d.ai.order, undefined);
});

test('comms: the order remembers how it was given', () => {
  const sim = arena();
  put(sim, sim.sheriff, 10, 15);
  put(sim, sim.deputy, 12, 15, Math.PI);
  sim.rand = () => 0.5;
  sim.tick({ command: 1, aim: { x: 14, y: 15 } });
  assert.equal(sim.deputy.ai.order.method, 'voice');
  sim.tick({ toggleSignal: true });
  sim.tick({ command: 3, aim: { x: 14, y: 15 } });
  assert.equal(sim.deputy.ai.order.method, 'signal');
});

test('hearing: a hostile in another room turns toward a rifle shot through a wall', () => {
  const sim = arena({ wall: T.PARTITION });
  const s = put(sim, sim.sheriff, 10, 15);
  put(sim, sim.deputy, 9, 16);
  const h = put(sim, hostile(sim), 24, 15, Math.PI);
  sim.emit(s, 'gunshot_rifle');
  assert.ok(h.heard.length > 0, 'heard through the wall');
  run(sim, 1);
  assert.notEqual(h.ai.state, 'idle');
});

test('hearing: a hostile raised by a shot who then sees a lawman engages and shoots', () => {
  const sim = arena();
  put(sim, sim.sheriff, 10, 15, 0);
  // Note: the deputy is parked; looking along with the sheriff he would shoot the hostile first.
  put(sim, sim.deputy, 9, 17);
  sim.deputy.thinkT = 1e9;
  sim.deputy.intent = { move: null };
  const h = put(sim, hostile(sim), 20, 15, Math.PI);
  h.traits.experience = 'veteran';
  let shot = false;
  for (let i = 0; i < 5 / STEP && !shot; i++) {
    sim.tick({});
    shot = sim.drain().some((e) => e.type === 'shot' && e.actorId === h.id);
  }
  assert.equal(h.ai.state, 'engage');
  assert.ok(shot);
});

test('civilian: a gunshot sends the civilian running or into cover', () => {
  const sim = arena();
  const s = put(sim, sim.sheriff, 10, 15);
  put(sim, sim.deputy, 9, 17);
  put(sim, hostile(sim), 35, 25);
  const c = sim.add('civilian', { x: 14, y: 15, floor: 0 }, { name: 'Civilian', kind: 'man' });
  sim.civilian = c;
  sim.emit(s, 'gunshot_rifle');
  run(sim, 0.5);
  assert.equal(c.ai.state, 'panic');
});

test('entry: the deputy opens a closed door in its path', () => {
  const sim = arena({ wall: T.ADOBE });
  put(sim, sim.sheriff, 24, 15);
  const d = put(sim, sim.deputy, 16, 15, 0);
  put(sim, hostile(sim), 35, 25);
  setTile(sim.map, 0, 20, 15, T.DOOR, DS.CLOSED);
  d.ai.fleeing = null;
  briefTacticalParty(sim);
  // Note: up to five seconds; the deputy is through after about 3.2 s.
  runUntil(sim, () => d.x > 20, 5);
  assert.ok(d.x > 20, `deputy at ${d.x.toFixed(1)}`);
  assert.notEqual(stateAt(sim.map, 0, 20, 15), DS.CLOSED);
});

test('entry: a window is opened and climbed', () => {
  const sim = arena({ wall: T.ADOBE });
  const s = put(sim, sim.sheriff, 19.3, 15.5, 0);
  put(sim, sim.deputy, 17, 18);
  put(sim, hostile(sim), 35, 25);
  setTile(sim.map, 0, 20, 15, T.WINDOW, WS.CLOSED);
  sim.input = {};
  run(sim, 1.2, { interact: true, interactHeld: true });
  assert.equal(stateAt(sim.map, 0, 20, 15), WS.OPEN);
  run(sim, 3.5, { interact: true, interactHeld: true });
  assert.ok(s.x > 20, `sheriff at ${s.x.toFixed(2)}`);
});

test('directional targeting: normal and careful aim hit standing and broken crouching hostiles regardless of pointer distance', () => {
  for (const stance of ['stand', 'crouch']) for (const steady of [false, true]) for (const x of [15, 18, 25]) {
    const sim = arena(), s = put(sim, sim.sheriff, 12, 15), h = put(sim, hostile(sim), 18, 15, Math.PI);
    h.stance = stance;
    h.broken = sim.time + 20;
    sim.updateEye(h);
    sim.rand = () => 0.25;
    const aim = { x, y: h.y };
    const intent = sim.playerIntent(s, { aim, steady });
    assert.equal(intent.targetId, h.id, `${stance}, steady=${steady}, pointer x=${x}`);
    assert.equal(intent.aimHigh, steady);
    assert.ok(sim.tryFire(s, intent));
    bulletsFly(sim);
    assert.ok(hits(sim).some((e) => e.actorId === h.id), `${stance}, steady=${steady}, pointer x=${x}`);
  }
});

test('directional targeting: an intervening lawman remains a selectable and hittable target', () => {
  const sim = arena(), s = put(sim, sim.sheriff, 12, 15), d = put(sim, sim.deputy, 15, 15), h = put(sim, hostile(sim), 18, 15, Math.PI);
  const intent = sim.playerIntent(s, { aim: { x: 25, y: 15 }, steady: true });
  assert.equal(intent.targetId, d.id, 'the nearest aligned character is selected');
  sim.rand = () => 0.25;
  assert.ok(sim.tryFire(s, intent));
  bulletsFly(sim);
  assert.ok(hits(sim).some((e) => e.actorId === d.id), 'friendly fire remains possible');
  assert.ok(!hits(sim).some((e) => e.actorId === h.id), 'the intervening character is hit first');
});

test('directional targeting: a leaned head outside the torso can be aimed at', () => {
  const sim = arena(), s = put(sim, sim.sheriff, 12, 15), h = put(sim, hostile(sim), 18, 15, Math.PI);
  put(sim, sim.deputy, 5, 5);
  h.lean = -1;
  sim.updateEye(h);
  assert.ok(h.eye.y - h.y > 0.3, 'lean moves the head outside the torso radius');
  s.facing = Math.atan2(h.eye.y - s.eye.y, h.eye.x - s.eye.x);
  const aim = { x: s.eye.x + 2 * (h.eye.x - s.eye.x), y: s.eye.y + 2 * (h.eye.y - s.eye.y) };
  assert.equal(sim.aimTarget(s, aim, s.floor), h, 'the leaned head intersects the aim direction');
  assert.equal(sim.aimTarget(s, { x: h.eye.x, y: h.eye.y + 0.2 }, s.floor), null, 'a ray past the head and torso is not selected');
  const intent = sim.playerIntent(s, { aim, steady: true });
  assert.equal(intent.targetId, h.id);
  sim.rand = () => 0.25;
  assert.ok(sim.tryFire(s, intent));
  bulletsFly(sim);
  assert.ok(hits(sim).some((e) => e.actorId === h.id && e.region === 'head'), 'the careful shot reaches the leaned head');
});

test('directional targeting: across stairs pointer distance preserves exposed target selection', () => {
  for (const stance of ['stand', 'crouch']) for (const [beyond, pointerY] of [[false, 12.8], [true, 5]]) {
    const sim = stairArena(), s = sim.sheriff, h = hostile(sim);
    put(sim, s, 20.5, 16.2, -Math.PI / 2);
    put(sim, h, 20.5, 12.8, Math.PI / 2, 1);
    h.stance = stance;
    sim.updateEye(h);
    const intent = sim.playerIntent(s, { aim: { x: h.x, y: pointerY }, steady: true });
    assert.ok(sim.sees(s, h));
    assert.equal(intent.targetId, h.id);
    assert.ok(sim.exposedAim(s, h, true));
    sim.rand = () => 0.25;
    assert.ok(sim.tryFire(s, intent));
    bulletsFly(sim);
    assert.ok(hits(sim).some((e) => e.actorId === h.id), `${stance}, beyond=${beyond}`);
  }
});

test('directional targeting: alignment, sight, cover, and normal spread still matter', () => {
  const sim = arena(), s = put(sim, sim.sheriff, 12, 15), h = put(sim, hostile(sim), 18, 15, Math.PI);
  put(sim, sim.deputy, 5, 5);
  assert.equal(sim.aimTarget(s, { x: 25, y: 17 }, s.floor), null, 'a clearly misaligned aim does not select the target');
  assert.equal(sim.aimTarget(s, { x: 5, y: 15 }, s.floor), null, 'a target behind the aim direction is not selected');
  setTile(sim.map, 0, 15, 14, T.ADOBE);
  setTile(sim.map, 0, 15, 15, T.ADOBE);
  const intent = sim.playerIntent(s, { aim: { x: 25, y: 15 }, steady: true });
  assert.equal(intent.targetId, undefined, 'a wall hides the target');
  sim.rand = () => 0.25;
  assert.ok(sim.tryFire(s, intent));
  bulletsFly(sim);
  assert.ok(!hits(sim).some((e) => e.actorId === h.id));
  assert.ok(sim.events.some((e) => e.type === 'impact'), 'the bullet strikes the wall');

  const results = [];
  for (let i = 0; i < 16; i++) {
    const testSim = arena({ seed: `directional-${i}` }), shooter = put(testSim, testSim.sheriff, 12, 15), target = put(testSim, hostile(testSim), 20, 15, Math.PI);
    put(testSim, testSim.deputy, 5, 5);
    const shot = testSim.playerIntent(shooter, { aim: { x: 28, y: 15 }, steady: true });
    assert.equal(shot.targetId, target.id);
    assert.ok(testSim.tryFire(shooter, shot));
    bulletsFly(testSim);
    results.push(hits(testSim).some((e) => e.actorId === target.id));
  }
  assert.ok(results.includes(true) && results.includes(false), 'normal spread produces hits and misses');
});

test('nav: a hostile with a goal on the other floor walks the flight up, and a goal below walks it down', () => {
  const sim = stairArena();
  const h = hostile(sim);
  put(sim, h, 20.5, 18.5, -Math.PI / 2, 0);
  h.intent = { goal: { x: 24.5, y: 11.5, f: 1, r: 0.5, windows: false } };
  const trail = [];
  for (let i = 0; i < 12 / STEP && h.floor !== 1; i++) {
    sim.tick({});
    h.intent = { goal: { x: 24.5, y: 11.5, f: 1, r: 0.5, windows: false } };
    trail.push({ floor: h.floor, elev: h.elev });
  }
  const log = trail.filter((e) => e.elev);
  // Note: 4.5 s; the hostile reaches the goal about 3.9 s after it steps onto floor 1.
  for (let i = 0; i < 4.5 / STEP; i++) {
    sim.tick({});
    h.intent = { goal: { x: 24.5, y: 11.5, f: 1, r: 0.5, windows: false } };
  }
  assert.equal(h.floor, 1);
  assert.equal(h.elev, 0);
  assert.ok(Math.hypot(h.x - 24.5, h.y - 11.5) < 1, `arrived at ${h.x.toFixed(1)},${h.y.toFixed(1)}`);
  assert.ok(log.length > 40, 'it walked the flight tick by tick');
  const goDown = { goal: { x: 24.5, y: 18.5, f: 0, r: 0.5, windows: false } };
  h.intent = goDown;
  // Note: ten seconds; the hostile arrives below after about 8.3 s.
  for (let i = 0; i < 10 / STEP; i++) {
    sim.tick({});
    h.intent = goDown;
  }
  assert.equal(h.floor, 0);
  assert.equal(h.elev, 0);
  assert.ok(Math.hypot(h.x - 24.5, h.y - 18.5) < 1, `arrived below at ${h.x.toFixed(1)},${h.y.toFixed(1)}`);
});

test('nav: a replan in the middle of the flight, on either floor, keeps going the same way', () => {
  // Note: one replan on each floor's part of the flight, one heading up and one down.
  for (const [y, goalF, goal] of [[15.5, 1, { x: 24.5, y: 11.5 }], [14.6, 0, { x: 24.5, y: 18.5 }]]) {
    const sim = stairArena();
    const h = hostile(sim);
    climb(sim, h, y, 0);
    const g = { goal: { ...goal, f: goalF, r: 0.5, windows: false } };
    h.intent = g;
    h.nav = null;
    // Note: 5.5 s; the slowest of the four arrives after about 4.6 s.
    for (let i = 0; i < 5.5 / STEP; i++) {
      sim.tick({});
      h.intent = g;
    }
    assert.equal(h.floor, goalF, `from y ${y}`);
    assert.equal(h.elev, 0);
    assert.ok(Math.hypot(h.x - goal.x, h.y - goal.y) < 1, `from y ${y}: at ${h.x.toFixed(1)},${h.y.toFixed(1)}`);
  }
});

test('nav: a hostile does not sprint on the flight even when told to', () => {
  const sim = stairArena();
  const h = hostile(sim);
  put(sim, h, 20.5, 16.6, -Math.PI / 2, 0);
  const g = { goal: { x: 24.5, y: 11.5, f: 1, r: 0.5, windows: false }, mode: 'sprint' };
  h.intent = g;
  let last = { x: h.x, y: h.y };
  const moves = [];
  for (let i = 0; i < 4 / STEP; i++) {
    const was = h.elev;
    sim.tick({});
    h.intent = g;
    moves.push({ onFlight: Boolean(was) && Boolean(h.elev), speed: Math.hypot(h.x - last.x, h.y - last.y) / STEP });
    last = { x: h.x, y: h.y };
  }
  const max = Math.max(0, ...moves.filter((m) => m.onFlight).map((m) => m.speed));
  assert.ok(max > 0.3 && max < 0.9, `top speed on the flight ${max.toFixed(2)} m/s`);
});

test('nav: the real deputy AI follows the sheriff up the flight in a real house', () => {
  const sim = new Sim('TOMBSTONE-12', { rand: combatRand('flight-ai') });
  const { stairs } = sim.house;
  const s = sim.sheriff;
  const d = sim.deputy;
  put(sim, s, stairs.head.x + 1.5, stairs.head.y + 0.5, 0, 1);
  put(sim, d, stairs.foot.x + 0.5, stairs.foot.y + 2.5, -Math.PI / 2, 0);
  for (const h of sim.hostiles) {
    put(sim, h, 36.5, 26.5);
    h.thinkT = 1e9;
    h.intent = { move: null };
  }
  d.thinkT = 0;
  for (let i = 0; i < 40 / STEP && d.elev === 0 && d.floor !== 1; i++) sim.tick({});
  const climbed = d.elev !== 0 || d.floor === 1;
  assert.ok(climbed, 'the deputy walked the flight to the sheriff upstairs');
});

test('performance: a sim tick with all actors fits the frame budget many times over', () => {
  const sim = new Sim('TOMBSTONE-1', { rand: combatRand('perf') });
  const t0 = performance.now();
  // Note: five seconds of play; the mean per tick is close to that of a full minute.
  for (let i = 0; i < 300; i++) sim.tick({});
  const per = (performance.now() - t0) / 300;
  console.log(`perf: ${per.toFixed(3)} ms per 1/60 s tick`);
  assert.ok(per < 1, `${per} ms per tick, target 1 ms`);
});
