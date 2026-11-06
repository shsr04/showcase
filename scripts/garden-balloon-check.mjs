// Note: node check for arrival balloon flights: clear of islands, lanes and each other; run from repo root with `node scripts/garden-balloon-check.mjs [seeds] [seconds]`.

import { World } from '../public/garden/js/world.js';
import { N, PLANT_KINDS } from '../public/garden/js/config.js';
import { startBuilding, findSite, builtOf } from '../public/garden/js/econ.js';
import { makeLink, linkPoints } from '../public/garden/js/links.js';
import { FLIGHT, buildField, blockedAt, padCells, flightBase, flightSway, flightTotal, laneBusy, clearLane, planFlight } from '../public/garden/js/flight.js';

const seeds = Number(process.argv[2] || 3);
const seconds = Number(process.argv[3] || 300);
let failures = 0;
const notes = [];
const fail = (m) => { failures++; if (failures <= 12) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

function setup(seed) {
  const w = World.createNew(seed);
  for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) w.reveal(w.getIsland(gx, gz), true);
  for (let k = 0; k < 600; k++) w.step(0.1);
  let rnd = 12345 + seed.length * 977 + seed.charCodeAt(seed.length - 1);
  const R = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  for (const isl of w.revealedIslands()) {
    // Note: crowd the island: pads first, then tall neighbours and trees so the column is tested.
    for (const id of ['pad', 'pad', 'windmill', 'lookout', 'hut', 'hut', 'smelter']) {
      const s = findSite(w, isl, id, null, null);
      if (s) startBuilding(w, isl, id, s.x, s.y, { built: true });
    }
    for (let c = 0; c < N * N; c++) if (isl.mask[c] && isl.bld[c] < 0 && R() < 0.22) { isl.plant[c] = 3 + Math.floor(R() * 3); isl.grow[c] = 1; }
  }
  // Note: a balloon link on every neighbouring pair.
  const isls = w.revealedIslands();
  for (const A of isls) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const B = w.getIsland(A.gx + dx, A.gz + dz);
    if (!B.revealed || w.linkBetween(A.id, B.id)) continue;
    const l = makeLink(w, A, B);
    if (!l || l.gap > 60) continue;
    l.type = 'balloon'; l.state = 'done'; l.progress = 1; l.built = true; l.pts = linkPoints(w, l);
    w.links.push(l);
  }
  return { w, R };
}

// Note: clearLane fells plants above the vehicle bottom minus 0.1, so a plant just under that line is the felled rule's edge, not a miss.
function plantKind(isl, c, p) {
  const a = Math.floor(c / N) * (N + 1) + (c % N);
  const base = Math.max(isl.h[a], isl.h[a + 1], isl.h[a + N + 1], isl.h[a + N + 2]);
  const kind = PLANT_KINDS[isl.plant[c]];
  return base + (FLIGHT.plant[kind] ?? 1) <= p.y + 0.95 - 0.1 ? 'plantEdge' : kind;
}

const stats = { spawned: 0, held: 0, samples: 0, pairs: 0, rises: new Map(), minIsl: 1e9, minBal: 1e9, padsBlocked: 0, pads: 0 };
for (let s = 0; s < seeds; s++) {
  const seed = `BAL-${s}`;
  const { w, R } = setup(seed);
  const pads = [];
  for (const isl of w.revealedIslands()) for (const p of builtOf(isl, 'pad')) pads.push([isl, p]);
  ok(pads.length > 4, `${seed}: only ${pads.length} pads`);
  // Note: every pad alone must find a flight (nothing else in the air).
  for (const [isl, pad] of pads) {
    stats.pads++;
    const keep = w.arrivals; w.arrivals = [];
    if (!planFlight(w, isl, pad, { n: 1, cargo: [], dur: 34, stay: 10, lift: 30, landed: false }, 0)) stats.padsBlocked++;
    w.arrivals = keep;
  }
  // Note: lanes of balloon links against island tops (information only; link visuals own the lane).
  let felled = 0;
  for (const l of w.links) if (l.type === 'balloon') felled += clearLane(w, l);
  const F0 = buildField(w); F0.lanes = [];
  let laneHit = 0; let laneInner = 0; let laneN = 0; const laneWhy = {}; let laneUp = 0;
  for (const l of w.links) if (l.type === 'balloon') for (const p of l.pts) { laneN++; const why = blockedAt(F0, p.x, p.y + 0.95, p.z, 0, null, 0.27); if (why) { laneHit++; let up = 0; while (up < 8 && blockedAt(F0, p.x, p.y + 0.95 + up, p.z, 0, null, 0.27)) up += 0.1; laneUp = Math.max(laneUp, up); const isl = w.islands.get(why.split(' ')[1]); const c = Number(why.split(' ')[3].split(',')[1]) * N + Number(why.split(' ')[3].split(',')[0]); const k = isl.bld[c] >= 0 ? ((p === l.pts[0] || p === l.pts[l.pts.length - 1]) ? 'bld' : (laneInner++, 'bld')) : isl.plant[c] ? plantKind(isl, c, p) : 'terrain'; laneWhy[k] = (laneWhy[k] || 0) + 1; } }
  notes.push(`${seed}: plants felled in lanes ${felled}; lane samples inside solids ${laneHit}/${laneN} ${JSON.stringify(laneWhy)}, max raise to clear ${laneUp.toFixed(1)}`);
  // Note: exact terrain test: bilinear height at nine points under the 0.72 wide vehicle against its bottom with the bob.
  let exactTerrain = 0;
  for (const l of w.links) if (l.type === 'balloon') for (const p of l.pts) {
    for (const isl of w.revealedIslands()) {
      for (const [ox, oz] of [[0, 0], [0.72, 0], [-0.72, 0], [0, 0.72], [0, -0.72], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
        const lx = p.x + ox - isl.wx + N / 2; const lz = p.z + oz - isl.wz + N / 2;
        if (!isl.land(Math.floor(lx), Math.floor(lz))) continue;
        if (isl.heightAt(lx, lz) > p.y + 0.95 - 0.08) exactTerrain++;
      }
    }
  }
  notes.push(`${seed}: exact terrain contacts of the vehicle footprint ${exactTerrain}`);
  // Note: station end points may sit beside a building; the lane interior must clear every building.
  ok(laneInner === 0, `${seed}: ${laneInner} lane samples inside buildings away from the stations`);
  // Note: building and terrain hits use conservative tops (3.3 per building, cell maxima); only felled-plant misses fail.
  ok(!Object.keys(laneWhy).some((k) => k !== 'bld' && k !== 'terrain' && k !== 'plantEdge'), `${seed}: lane meets ${JSON.stringify(laneWhy)}`);

  let F = buildField(w);
  let wind = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    if (Math.round(t * 10) % 40 === 0) {
      const isl = w.revealedIslands()[Math.floor(R() * w.revealedIslands().length)];
      const ar = w.spawnArrival(isl);
      if (ar) { stats.spawned++; stats.rises.set(ar.rise, (stats.rises.get(ar.rise) || 0) + 1); } else stats.held++;
    }
    if (Math.round(t * 10) % 50 === 0) { F = buildField(w); wind = R() * Math.PI * 2; }
    w.weather.wind.x = Math.cos(wind); w.weather.wind.z = Math.sin(wind); w.weather.wind.s = 0.9;
    w.step(0.1);
    w.events.length = 0;
    const live = w.arrivals.filter((a) => a.x0 !== undefined);
    const poses = [];
    for (const ar of live) {
      if (ar.t > flightTotal(ar)) continue;
      const skip = { isl: ar.isl, cells: padCells(ar.pad) };
      for (const dt of [0, 0.037, 0.071]) {
        const b = flightBase(ar, ar.t + dt, ar.x0, ar.z0, ar.rest);
        const sw = flightSway(ar, w.time + dt * 13, w.weather.wind, b.air);
        const p = { x: b.x + sw.x, y: b.y + sw.y, z: b.z + sw.z };
        stats.samples++;
        if (![p.x, p.y, p.z].every(Number.isFinite)) { fail(`${seed}: NaN pose`); continue; }
        const why = blockedAt(F, p.x, p.y, p.z, 0, skip, 0.1);
        ok(!why, `${seed} t=${t.toFixed(1)} ar.t=${ar.t.toFixed(1)}: basket meets ${why}`);
        if (dt === 0) poses.push({ ar, p });
        // Note: the last stretch of the drop and the first of the lift are vertical over the pad.
        if (ar.t >= ar.dur * FLIGHT.tH && ar.t <= ar.dur + ar.stay) ok(Math.hypot(b.x - ar.x0, b.z - ar.z0) < 1e-6, `${seed}: drop not vertical`);
      }
    }
    for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
      const d = Math.hypot(poses[i].p.x - poses[j].p.x, poses[i].p.y - poses[j].p.y, poses[i].p.z - poses[j].p.z);
      stats.pairs++; stats.minBal = Math.min(stats.minBal, d);
      ok(d >= 3, `${seed}: balloons ${d.toFixed(2)} apart`);
    }
  }
}

// Note: lane gate: an arrival crossing a balloon lane holds the link balloon; nothing in the air frees it.
{
  const { w } = setup('BAL-lane');
  const l = w.links.find((q) => q.type === 'balloon');
  ok(!!l, 'lane test needs a balloon link');
  w.arrivals = [];
  ok(!laneBusy(w, l), 'idle sky must not hold the lane');
  const m = l.pts[Math.floor(l.pts.length / 2)];
  const fake = { isl: w.islands.get(l.a), pad: { x: 0, y: 0, size: 2 }, n: 0, cargo: [], dur: 34, stay: 10, lift: 30, ang: 0, rise: 38, x0: m.x, z0: m.z, rest: m.y, t: 20 };
  w.arrivals = [fake];
  ok(laneBusy(w, l), 'arrival over the lane must hold the link balloon');
  fake.t = flightTotal(fake) + 3;
  ok(!laneBusy(w, l), 'a finished arrival must free the lane');
}

console.log(`arrivals spawned ${stats.spawned}, held ${stats.held}; pad alone blocked ${stats.padsBlocked}/${stats.pads}; samples ${stats.samples}, pairs ${stats.pairs}, min balloon gap ${stats.minBal.toFixed(1)}`);
console.log('cruise heights used:', [...stats.rises.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}x${v}`).join(' '));
for (const n of notes) console.log(n);
ok(stats.spawned > 10, 'too few arrivals spawned');
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('garden-balloon-check OK');
