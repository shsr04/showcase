// Note: node check for the Ambassador (R8: ships.js, world.js, ledger.js); run from the repo root with `node scripts/garden-ambassador-check.mjs [seeds]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { N } = await import('../public/garden/js/config.js');
const SH = await import('../public/garden/js/ships.js');
const SG = await import('../public/garden/js/sighting.js');
const PIER = await import('../public/garden/js/pier.js');
const { isDormant } = await import('../public/garden/js/rareisles.js');

const seeds = Number(process.argv[2] || 2);
let failures = 0;
const fail = (m) => { failures++; if (failures <= 25) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

// Note: a free 3x3 land block on the rim with a pier direction over the void; null when the island has none.
function landBlock(isl) {
  for (let y = 0; y + 3 <= N; y++) for (let x = 0; x + 3 <= N; x++) {
    let good = true;
    for (let j = y; j < y + 3 && good; j++) for (let i = x; i < x + 3 && good; i++) if (isl.mask[j * N + i] !== 1) good = false;
    if (!good) continue;
    const dirs = PIER.pierDirs(isl, x, y);
    if (!dirs.length) continue;
    for (const b of isl.buildings) if (b && !b.gone && x < b.x + b.size + 1 && x + 3 > b.x - 1 && y < b.y + b.size + 1 && y + 3 > b.y - 1) good = false;
    if (good) return { x, y, dir: dirs[0] };
  }
  return null;
}

function dockOn(isl) {
  const spot = landBlock(isl);
  if (!spot) return false;
  isl.buildings.push({ id: 'airdock', x: spot.x, y: spot.y, size: 3, dir: spot.dir, built: true, flourish: 0, door: { i: spot.x, j: spot.y + 3 } });
  return true;
}

// Note: a world with docks on home and its three nearest neighbours, tier forced to 5 once the run starts.
function build(seed, n) {
  rs = 31 + n;
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  const home = w.islands.get('0,0');
  const near = [...w.islands.values()].filter((i) => i !== home && !i.rare && !i.special).sort((a, b) => Math.hypot(a.wx - home.wx, a.wz - home.wz) - Math.hypot(b.wx - home.wx, b.wz - home.wz));
  for (const i of near.slice(0, 8)) w.reveal(i, true);
  dockOn(home);
  const docks = [home, ...near.slice(0, 8).filter(dockOn).slice(0, 3)];
  w.known.add('navigation'); w.recomputeUnlocked();
  w.ships = [];
  return { w, home, docks };
}

const arrivals = (w) => w.events.filter((e) => e.type === 'visitor' && e.kind === 'ambassador').length;

// Note: steps until the Ambassador has landed (or the limit hits); returns the fingerprint of that moment.
function arrive(seed, n) {
  const { w, home, docks } = build(seed, n);
  ok(docks.length >= 4 && docks[0] === home, `${seed}: need 4 docks, got ${docks.length}`);
  const rare = SG.rareIslands(w);
  ok(rare.length > 0, `${seed}: no rare islands`);
  w.events.length = 0;
  let seen = 0;
  const lands = [];
  // Note: tier 4 and below: nothing comes.
  w.tierForce = 4;
  for (let k = 0; k < 100; k++) { w.step(0.1); seen += arrivals(w); w.events.length = 0; }
  ok(seen === 0 && !w.ambassador.sent && !w.fleetLease, `${seed}: Ambassador before tier 5`);
  w.tierForce = 5;
  const t5 = w.time;
  let landedAt = -1;
  for (let k = 0; k < 6000 && landedAt < 0; k++) {
    w.step(0.1);
    for (const e of w.events) { if (e.type === 'visitor' && e.kind === 'ambassador') { seen++; landedAt = w.time; lands.push(e); } }
    w.events.length = 0;
  }
  ok(seen === 1, `${seed}: ${seen} arrivals`);
  if (landedAt < 0) return { w, home, docks, rare, fp: 'none' };
  ok(w.ambassador.sent && w.ambassador.done, `${seed}: flags ${JSON.stringify(w.ambassador)}`);
  ok(w.fleetLease && Math.abs(w.fleetLease.until - (landedAt - 0.1 + SH.LEASE.term)) < 1 && w.fleetLease.extra === 3, `${seed}: lease ${JSON.stringify(w.fleetLease)} at ${landedAt}`);
  ok((w.deeds || []).filter((d) => d.kind === 'ambassador').length === 1, `${seed}: deed count`);
  for (const B of rare) {
    ok(B.revealed, `${seed}: ${B.id} not revealed`);
    ok(SG.isSighted(w, B), `${seed}: ${B.id} not sighted`);
    ok(!B.explored, `${seed}: ${B.id} explored`);
    ok(isDormant(B), `${seed}: ${B.id} awake`);
  }
  ok(SH.maxCargo(w) === 6, `${seed}: lease cap ${SH.maxCargo(w)}`);
  const fp = JSON.stringify({ t: Math.round((landedAt - t5) * 10), lease: w.fleetLease, deeds: w.deeds, rev: rare.map((i) => [i.id, i.revealed, i.explored]), sighted: [...w.sighted].sort() });
  return { w, home, docks, rare, fp, landedAt };
}

for (let n = 0; n < seeds; n++) {
  const seed = `AMB-${n}`;
  const a = arrive(seed, n);
  const b = arrive(seed, n);
  ok(a.fp === b.fp && a.fp !== 'none', `${seed}: not deterministic`);
  const { w } = a;
  if (a.fp === 'none') continue;

  // Once: tier 5 stays, no second Ambassador over a long stretch.
  let again = 0;
  for (let k = 0; k < 3000; k++) { w.step(0.1); again += arrivals(w); w.events.length = 0; }
  ok(again === 0, `${seed}: a second Ambassador came`);
  ok(w.ships.filter((s) => s.visit && s.visit.who === 'ambassador').length <= 1, `${seed}: stray ambassador hulls`);

  // Save round trip keeps lease and flag; a loaded world sends nobody again.
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
  ok(w2.ambassador.done && w2.ambassador.sent, `${seed}: flag lost`);
  ok(w2.fleetLease && w2.fleetLease.until === w.fleetLease.until && w2.fleetLease.extra === 3, `${seed}: lease lost`);
  ok(SH.maxCargo(w2) === 6, `${seed}: loaded cap ${SH.maxCargo(w2)}`);
  w2.tierForce = 5;
  let again2 = 0;
  for (let k = 0; k < 300; k++) { w2.step(0.1); again2 += arrivals(w2); w2.events.length = 0; }
  ok(again2 === 0, `${seed}: Ambassador after load`);
  // Note: an old save without the fields loads with no lease and no flag.
  const old = JSON.parse(JSON.stringify(w.toJSON())); delete old.ambassador; delete old.lease;
  const w3 = World.fromJSON(old);
  ok(!w3.ambassador.done && !w3.fleetLease && SH.maxCargo(w3) === 3, `${seed}: old save fields`);

  // Lease end: the cap falls to 3; idle empty surplus hulls leave, a hull with crates stays.
  w.ships = [];
  const homes = a.docks.map((i) => i.id);
  for (let k = 0; k < 8; k++) SH.addCargoShip(w, homes[k % homes.length]);
  ok(w.ships.length >= 5, `${seed}: only ${w.ships.length} hulls added`);
  const loaded = w.ships.slice().sort((p, q) => q.id - p.id)[0];
  loaded.cargo = { stone: 2 };
  loaded.t = -1e6;
  w.fleetLease.until = w.time + 2;
  const before = w.ships.length;
  w.step(0.1);
  ok(w.ships.length === before, `${seed}: hulls left while the lease ran`);
  w.time = w.fleetLease.until + 0.01;
  ok(SH.maxCargo(w) === 3, `${seed}: cap after lease ${SH.maxCargo(w)}`);
  const ids = new Set(w.ships.map((s) => s.id));
  for (let k = 0; k < 120; k++) w.step(0.1);
  const cargoHulls = w.ships.filter((s) => s.kind === 'cargo');
  ok(cargoHulls.length <= 4 && cargoHulls.length >= 3, `${seed}: ${cargoHulls.length} hulls after lease`);
  ok(w.ships.some((s) => s.id === loaded.id), `${seed}: hull with crates was removed`);
  ok(w.ships.every((s) => ids.has(s.id)), `${seed}: a hull appeared after the lease`);
  console.log(`  ${seed}: landed ${(a.landedAt - 0).toFixed(0)} s, hulls ${before} -> ${cargoHulls.length}`);
}

console.log(failures ? `garden ambassador check: ${failures} failure(s)` : 'garden ambassador check: all ok');
process.exit(failures ? 1 : 0);
