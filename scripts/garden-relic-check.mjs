// Note: node check for the fixed relic plan (rareisles.js relicPlan) and relic placement in generateIsland.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-relic-check.mjs [seeds] [first seed index]; 200 seeds take about 3 minutes, so run chunks (e.g. 50 0, 50 50) under timeout 240.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const { generateIsland, ringOf, islandGeom, anchorsBetween } = await J('island.js');
const { KNOWLEDGE } = await J('config.js');
const R = await J('rareisles.js');
const { computeAnchors } = await J('links.js');
const { reachMap } = await J('path.js');
const { LINKS } = await J('config.js');
const { hashStr } = await J('rand.js');

const seeds = Number(process.argv[2] || 200);
const first = Number(process.argv[3] || 0);
let failures = 0; let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) { failures++; if (failures < 40) console.error('FAIL:', m); } };
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const parse = (id) => id.split(',').map(Number);

const WANT = { 2: { ballooning: 2, weaving: 1, smithing: 1, smoking: 1, husbandry: 1 }, 3: { lampcraft: 1, glasswork: 1 }, 4: { navigation: 2, pulleys: 2 } };

for (let s = first; s < first + seeds; s++) {
  const seed = 101 + s * 6607;
  const L = `seed ${seed}`;
  const plan = R.relicPlan(seed);
  ok(JSON.stringify(plan) === JSON.stringify(R.relicPlan(seed)), `${L}: plan deterministic`);
  ok(R.relicPlan(seed) === plan, `${L}: plan memoised`);
  const slots = R.rareSlots(seed);
  const slotCells = []; for (const t in slots) for (const e of slots[t]) slotCells.push([e.gx, e.gz]);
  const count = {};
  for (const id in plan) {
    const c = parse(id); const ring = ringOf(c[0], c[1]);
    ok(ring >= 2 && ring <= 4, `${L}: relic ring ${ring} at ${id}`);
    ok(R.slotAt(seed, c[0], c[1]) === null, `${L}: relic on slot ${id}`);
    ok(!!KNOWLEDGE[plan[id]], `${L}: known tech ${plan[id]}`);
    (count[ring] ||= {})[plan[id]] = (count[ring][plan[id]] || 0) + 1;
  }
  for (const ring of [2, 3, 4]) ok(JSON.stringify(Object.entries(count[ring] || {}).sort()) === JSON.stringify(Object.entries(WANT[ring]).sort()), `${L}: ring ${ring} relics ${JSON.stringify(count[ring])}`);
  const at = (know) => Object.keys(plan).filter((id) => plan[id] === know).map(parse);
  const r4 = [...at('navigation'), ...at('pulleys')];
  for (let a = 0; a < r4.length; a++) {
    for (let b = a + 1; b < r4.length; b++) ok(cheb(r4[a], r4[b]) >= 3, `${L}: ring 4 relics ${r4[a]} ${r4[b]} too close`);
    for (const sc of slotCells.filter((c) => ringOf(c[0], c[1]) === 4)) ok(cheb(r4[a], sc) >= 3, `${L}: ring 4 relic ${r4[a]} near slot ${sc}`);
  }
  ok(at('ballooning').length === 2 && R.RARE_RINGS.every((x) => x >= 4), `${L}: ballooning x2`);
}

// Note: generateIsland carries a relic only where the plan says; ring 1 keeps its dice.
for (let s = 0; s < 12; s++) {
  const seed = 31 + s * 977;
  const plan = R.relicPlan(seed);
  let planned = 0;
  for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
    const ring = ringOf(gx, gz);
    if (ring < 1) continue;
    const id = `${gx},${gz}`;
    const know = R.slotAt(seed, gx, gz) ? null : plan[id] || null;
    const isl = generateIsland(seed, gx, gz, know);
    const L = `seed ${seed} ${id}`;
    if (ring === 1) { ok(isl.relic && isl.relic.know, `${L}: ring 1 relic`); continue; }
    if (know) {
      planned++;
      ok(isl.relic && isl.relic.know === know && !isl.relic.taken, `${L}: relic ${know}`);
      ok(isl.land(isl.relic.i, isl.relic.j), `${L}: relic on land`);
    } else ok(isl.relic === null, `${L}: no relic`);
    // Note: geometry helper agrees with the full island.
    const g = islandGeom(seed, gx, gz);
    ok(g.wx === isl.wx && g.wz === isl.wz && g.radius === isl.radius, `${L}: geom`);
    ok(generateIsland(seed, gx, gz, know).relic?.i === isl.relic?.i, `${L}: relic cell deterministic`);
  }
  ok(planned === 6 + 2 + 4, `seed ${seed}: planned relics ${planned}`);
}

// Note: independent route search over the real link code: states are (island, entry cell), the value is the longest hop on the best route; slot islands never serve as hops.
// Note: the source island offers the cells walkable from its entry cell, home offers every walkable cell; no safety margin here.
function bottlenecks(seed) {
  const slots = new Set(); const sl = R.rareSlots(seed);
  for (const t in sl) for (const e of sl[t]) slots.add(`${e.gx},${e.gz}`);
  const made = new Map();
  const isl = (gx, gz) => {
    const id = `${gx},${gz}`;
    if (slots.has(id)) return null;
    if (!made.has(id)) made.set(id, generateIsland(seed, gx, gz, null));
    return made.get(id);
  };
  const dist = new Map([['0,0|', { id: '0,0', gx: 0, gz: 0, e: null, v: 0, done: false }]]);
  const best = new Map([['0,0', 0]]);
  let mismatch = 0;
  for (;;) {
    let cur = null; let ck = '';
    for (const [k, st] of dist) if (!st.done && (!cur || st.v < cur.v || (st.v === cur.v && k < ck))) { cur = st; ck = k; }
    if (!cur) break;
    cur.done = true;
    const X = isl(cur.gx, cur.gz);
    X.reach = cur.e ? reachMap(X, cur.e.i, cur.e.j) : null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cur.gx + dx; const gz = cur.gz + dz;
      if (ringOf(gx, gz) > 4) continue;
      const Y = isl(gx, gz);
      if (!Y) continue;
      const an = computeAnchors(X, Y);
      // Note: the shared geometry helper must equal links.js computeAnchors on every ring 1 and 2 pair.
      if (ringOf(cur.gx, cur.gz) <= 2 && ringOf(gx, gz) <= 2) {
        const mine = anchorsBetween(X, Y);
        if (JSON.stringify(mine) !== JSON.stringify(an)) mismatch++;
      }
      if (!an || an.gap > LINKS.balloon.gap) continue;
      const v = Math.max(cur.v, an.gap);
      const id = `${gx},${gz}`; const key = `${id}|${an.bi.i},${an.bi.j}`;
      const old = dist.get(key);
      if (!old || v < old.v) dist.set(key, { id, gx, gz, e: an.bi, v, done: false });
      if (!(best.get(id) <= v)) best.set(id, v);
    }
  }
  return { best, mismatch };
}

const worst = { ballooning: [0, ''], weaving: [0, ''], navigation: [0, ''] };
let mismatches = 0; let edgeless = 0;
const t0 = Date.now();
// Note: the pace seeds SKY-1000 to SKY-1004 run besides the numeric seeds, and print their longest hops.
const routeSeeds = [];
for (let s = first; s < first + seeds; s++) routeSeeds.push({ seed: 101 + s * 6607, L: `seed ${101 + s * 6607}` });
if (first === 0) for (let n = 0; n < 5; n++) routeSeeds.push({ seed: hashStr(`SKY-${1000 + n}`), L: `SKY-${1000 + n}`, print: true });
for (const { seed, L, print } of routeSeeds) {
  const plan = R.relicPlan(seed);
  const { best, mismatch } = bottlenecks(seed);
  mismatches += mismatch;
  const at = (know) => Object.keys(plan).filter((id) => plan[id] === know);
  const reach = (know) => Math.min(...at(know).map((id) => (best.has(id) ? best.get(id) : 1e9)));
  const g = { ballooning: reach('ballooning'), weaving: reach('weaving'), navigation: reach('navigation') };
  ok(g.ballooning <= LINKS.ropebridge.gap, `${L}: no rope route to a ballooning island (${g.ballooning.toFixed(1)})`);
  ok(g.weaving <= LINKS.ropebridge.gap, `${L}: no rope route to a weaving island (${g.weaving.toFixed(1)})`);
  ok(g.navigation <= LINKS.balloon.gap, `${L}: no balloon route to a navigation island (${g.navigation.toFixed(1)})`);
  for (const k in g) if (g[k] > worst[k][0]) worst[k] = [g[k], L];
  if (g.navigation >= 1e9) edgeless++;
  if (print) console.log(`${L}: longest hop to ballooning ${g.ballooning.toFixed(1)}, weaving ${g.weaving.toFixed(1)}, navigation ${g.navigation.toFixed(1)}`);
}
console.log(`route check over ${routeSeeds.length} seeds (${((Date.now() - t0) / 1000).toFixed(0)} s): worst longest hop to ballooning ${worst.ballooning[0].toFixed(1)} (${worst.ballooning[1]}), weaving ${worst.weaving[0].toFixed(1)} (${worst.weaving[1]}), navigation ${worst.navigation[0].toFixed(1)} (${worst.navigation[1]}); limits 34 / 34 / 42; navigation unreachable on ${edgeless} seeds`);
ok(mismatches === 0, `anchorsBetween differs from links.js computeAnchors on ${mismatches} ring 1 and 2 pairs`);

console.log(`${checks} checks, ${failures} failures`);
if (failures) process.exit(1);
console.log('relic checks ok');
