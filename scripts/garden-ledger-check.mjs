// Note: node check for the fleet ledger and the landing party (ledger.js, colony.js, ships.js); run from the repo root with `node scripts/garden-ledger-check.mjs [seeds]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { SIM_DT, N } = await import('../public/garden/js/config.js');
const SH = await import('../public/garden/js/ships.js');
const CO = await import('../public/garden/js/colony.js');
const SG = await import('../public/garden/js/sighting.js');
const LE = await import('../public/garden/js/ledger.js');
const GW = await import('../public/garden/js/greatwork.js');
const PIER = await import('../public/garden/js/pier.js');
const { createFolk } = await import('../public/garden/js/folk.js');
const { findSite } = await import('../public/garden/js/econ.js');
const { rareSlots, RARE_TRAITS, isDormant } = await import('../public/garden/js/rareisles.js');

const seeds = Number(process.argv[2] || 2);
let failures = 0;
const fail = (m) => { failures++; if (failures <= 25) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };
const SEC = 4;

const rareIsles = (w) => RARE_TRAITS.map((t) => { const e = rareSlots(w.seed)[t][0]; return w.getIsland(e.gx, e.gz); });
const calm = (w) => { for (const i of rareIsles(w)) i.explored = true; };

// Note: a free 3x3 land block with a pier side over the void, or null.
function landBlock(isl) {
  let best = null;
  for (let y = 0; y + 3 <= N; y++) for (let x = 0; x + 3 <= N; x++) {
    let good = true; let lo = 1e9; let hi = -1e9;
    for (let j = y; j < y + 3 && good; j++) for (let i = x; i < x + 3 && good; i++) if (isl.mask[j * N + i] !== 1) good = false;
    if (!good) continue;
    const dirs = PIER.pierDirs(isl, x, y);
    if (!dirs.length) continue;
    for (const b of isl.buildings) if (b && !b.gone && x < b.x + b.size + 1 && x + 3 > b.x - 1 && y < b.y + b.size + 1 && y + 3 > b.y - 1) good = false;
    if (!good) continue;
    for (let j = y; j <= y + 3; j++) for (let i = x; i <= x + 3; i++) { const h = isl.h[j * (N + 1) + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (!best || hi - lo < best.d) best = { x, y, d: hi - lo, dir: dirs[0] };
  }
  return best;
}

// Note: a real World with three dock islands: A (home, full shelves), B and C (wants); council tier 4 by hand, navigation known, rare islands explored.
function build(seed, opts = {}) {
  rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  w.known.add('navigation'); w.recomputeUnlocked();
  w.tierForce = opts.tier ?? 4;
  calm(w);
  const home = w.getIsland(0, 0);
  const near = [...w.islands.values()].filter((i) => i !== home && !i.rare && !i.special).sort((a, b) => Math.hypot(a.wx - home.wx, a.wz - home.wz) - Math.hypot(b.wx - home.wx, b.wz - home.wz) || (a.id < b.id ? -1 : 1));
  const picks = [home, near[0], near[1]];
  for (const i of picks) w.reveal(i, true);
  for (const i of picks) {
    const spot = landBlock(i);
    if (!spot) return null;
    i.buildings.push({ id: 'airdock', x: spot.x, y: spot.y, size: 3, dir: spot.dir, built: true, flourish: 0, door: { i: spot.x, j: spot.y + 3 } });
  }
  for (const i of picks) { i.stock = {}; i.want = {}; i.goals = []; i.linkWant = null; }
  w.folk = []; // Note: no folk, so no party and no colony flight can start by accident.
  picks[0].stock = { stone: 30, plank: 30, moonpearl: 0 };
  w.ships = [];
  w.time = 0;
  w.events.length = 0;
  w.shipAuto = false; // Note: hulls come from addCargoShip only.
  return { w, picks };
}

const sumGood = (w, g) => [...w.islands.values()].reduce((n, i) => n + ((i.stock && i.stock[g]) || 0), 0) + w.ships.reduce((n, s) => n + (s.cargo[g] || 0), 0);
const stateOf = (w) => JSON.stringify({ ships: SH.shipsToJSON(w), stock: [...w.islands.values()].filter((i) => i.revealed).map((i) => [i.id, i.stock]) });

// Note: steps ships and the ledger by the integer step index, as the ship check does; the ledger ticks on its own bucket.
function run(w, from, to, log, opts = {}) {
  for (let k = Math.ceil(from / SIM_DT - 1e-9); k * SIM_DT < to; k++) {
    w.time = k * SIM_DT;
    if (opts.fleet !== false && k % 40 === 0) LE.planFleet(w);
    for (const e of SH.stepShips(w, SIM_DT, null)) {
      if (e.type === 'shipdepart') log.push({ t: Math.round(w.time * 10) / 10, id: e.ship.id, from: e.ship.from, to: e.ship.to, cargo: { ...e.ship.cargo } });
    }
  }
}

// Note: 1. a ledger trip beats the idle best-haul; below tier 4 and before the first tick the old rule holds.
function checkBeatsBestHaul(seed) {
  const first = (mode) => {
    const g = build(seed, { tier: mode === 'old' ? 3 : 4 });
    if (!g) return null;
    const { w, picks } = g;
    const [A, B, C] = picks;
    B.want = { stone: 8, plank: 8 };
    // Note: C holds the Great Work: it asks for foundation stone, fewer crates than B but a higher rank.
    C.special = 'spire'; C.want = { stone: 6 };
    w.gw = GW.newGw();
    SH.addCargoShip(w, A.id);
    const log = [];
    run(w, 0, 120, log, { fleet: mode !== 'old' && mode !== 'noledger' });
    return log[0] || null;
  };
  const old = first('old'); const noLedger = first('noledger'); const led = first('ledger');
  ok(old && led && noLedger, `${seed}: no departure ${JSON.stringify([old, noLedger, led])}`);
  if (!(old && led && noLedger)) return;
  const g = build(seed);
  const B = g.picks[1].id; const C = g.picks[2].id;
  ok(old.to === B, `${seed}: tier 3 hull should take the biggest haul to ${B}, went ${old.to}`);
  ok(noLedger.to === B, `${seed}: tier 4 without a ledger tick should still best-haul to ${B}, went ${noLedger.to}`);
  ok(led.to === C && led.cargo.stone === 6, `${seed}: ledger trip should serve the Great Work at ${C}, went ${led.to} ${JSON.stringify(led.cargo)}`);
  console.log(`  ${seed}: best-haul to ${old.to} (${Object.values(old.cargo).reduce((a, b) => a + b, 0)} crates), ledger to ${led.to} (${JSON.stringify(led.cargo)})`);
}

// Note: 2. priority: Great Work, then island project, then plain wants, at equal distance and equal crates.
function checkPriority(seed) {
  const g = build(seed);
  if (!g) return;
  const { w, picks } = g;
  const [A, B, C] = picks;
  B.wx = A.wx + 70; B.wz = A.wz; C.wx = A.wx - 70; C.wz = A.wz;
  B.want = { stone: 6 }; C.want = { stone: 6 }; C.linkWant = { stone: 6 };
  SH.addCargoShip(w, A.id);
  const log = [];
  run(w, 0, 80, log);
  ok(log[0] && log[0].to === C.id, `${seed}: project goods lost against plain wants (${log[0] && log[0].to})`);
  const g2 = build(seed);
  const [A2, B2, C2] = g2.picks;
  B2.wx = A2.wx + 70; B2.wz = A2.wz; C2.wx = A2.wx - 70; C2.wz = A2.wz;
  B2.want = { stone: 6 }; C2.want = { stone: 6 }; B2.goals = [{ key: 'airdock', pressure: 3, cost: { stone: 6 } }];
  SH.addCargoShip(g2.w, A2.id);
  const log2 = [];
  run(g2.w, 0, 80, log2);
  ok(log2[0] && log2[0].to === B2.id, `${seed}: a goal's goods lost against plain wants (${log2[0] && log2[0].to})`);
}

// Note: 3. rare fetch: the Great Work lacks a rare good that sits on a dock island; one hull fetches it exactly once.
function checkRareFetch(seed) {
  const mk = (tier) => {
    const g = build(seed, { tier });
    if (!g) return null;
    const { w, picks } = g;
    const [A, R, S] = picks;
    S.special = 'spire'; R.rareSlot = 'misty'; R.rare = R.rare || null;
    w.gw = GW.newGw();
    for (const [good, n] of Object.entries(GW.GW_FOUNDATION)) GW.gwDeliver(w.gw, good, n, 1);
    R.stock.moonpearl = 1;
    A.stock = {};
    SH.addCargoShip(w, A.id);
    SH.addCargoShip(w, A.id);
    return g;
  };
  { // tier 4: the hull sails empty to R, loads one crate, delivers it to the Spire
    const g = mk(4);
    if (!g) return;
    const { w, picks } = g;
    const [A, R, S] = picks;
    ok(Object.keys(GW.gwRareNeeds(w.gw)).includes('moonpearl'), `${seed}: moonpearl is not a rare need`);
    const log = [];
    run(w, 0, 400, log);
    const deps = log.filter((e) => e.cargo.moonpearl);
    ok(deps.length === 1 && deps[0].from === R.id && deps[0].to === S.id, `${seed}: moonpearl legs ${JSON.stringify(deps)}`);
    ok(log.some((e) => e.from === A.id && e.to === R.id && !Object.keys(e.cargo).length), `${seed}: no empty sail to the rare island ${JSON.stringify(log.slice(0, 3))}`);
    ok(S.stock.moonpearl === 1 && R.stock.moonpearl === 0 && sumGood(w, 'moonpearl') === 1, `${seed}: moonpearl R ${R.stock.moonpearl} S ${S.stock.moonpearl}`);
    run(w, 400, 800, log);
    ok(log.filter((e) => e.cargo.moonpearl).length === 1 && sumGood(w, 'moonpearl') === 1, `${seed}: moonpearl moved twice`);
    // Note: a second need while the first is in transit: only goods not yet in the air are fetched.
  }
  { // tier 3: the old rule still works: a hull sails empty to the dock where a Spire haul waits
    const g = mk(3);
    if (!g) return;
    const { w, picks } = g;
    const log = [];
    run(w, 0, 400, log);
    ok(picks[2].stock.moonpearl === 1 && sumGood(w, 'moonpearl') === 1, `${seed}: tier 3 old rule: moonpearl R ${picks[1].stock.moonpearl} S ${picks[2].stock.moonpearl}`);
    ok(!w.ledger, `${seed}: tier 3 ticked a ledger`);
  }
  { // not needed yet (foundation open): rare goods stay put
    const g = mk(4);
    if (!g) return;
    g.w.gw = GW.newGw();
    const log = [];
    run(g.w, 0, 300, log);
    ok(g.picks[1].stock.moonpearl === 1 && !log.some((e) => e.cargo.moonpearl), `${seed}: fetched a rare good before the foundation stands`);
  }
}

// Note: 4. slot pressure: parked hulls on a full dock island give way and the wanted trip completes.
function checkSlots(seed) {
  const g = build(seed);
  if (!g) return;
  const { w, picks } = g;
  const [A, B, C] = picks;
  B.want = { stone: 6 };
  SH.addCargoShip(w, A.id); SH.addCargoShip(w, A.id);
  SH.addCargoShip(w, B.id); SH.addCargoShip(w, B.id);
  ok(SH.slotsFree(w, A.id, 0) === 0 && SH.slotsFree(w, B.id, 0) === 0, `${seed}: setup not full`);
  const log = [];
  run(w, 0, 500, log);
  ok(B.stock.stone >= 6, `${seed}: wanted stone never reached the full dock island (${B.stock.stone})`);
  ok(w.ships.every((s) => s.state === 'idle') || w.ships.length === 4, `${seed}: ships lost`);
  ok(sumGood(w, 'stone') === 30, `${seed}: stone not conserved ${sumGood(w, 'stone')}`);
  for (const i of picks) ok(SH.slotsFree(w, i.id, 0) >= 0, `${seed}: negative moorings`);
}

// Note: 5. reservation: two idle hulls and one want: the crates and the dock are booked, nothing is sent twice.
function checkReserve(seed) {
  const g = build(seed);
  if (!g) return;
  const { w, picks } = g;
  const [A, B] = picks;
  B.want = { stone: 6 };
  SH.addCargoShip(w, A.id); SH.addCargoShip(w, A.id);
  const log = [];
  run(w, 0, 300, log);
  const stoneLegs = log.filter((e) => e.cargo.stone && e.to === B.id);
  ok(stoneLegs.length === 1 && stoneLegs[0].cargo.stone === 6, `${seed}: ${stoneLegs.length} hauls for one want ${JSON.stringify(stoneLegs)}`);
  ok(B.stock.stone === 6 && sumGood(w, 'stone') === 30, `${seed}: B stone ${B.stock.stone}`);
  // Note: the surplus rule keeps the wanted stock: A never gives below its own want, never below two.
  A.want = { plank: 29 };
  B.want = { plank: 6 };
  const log2 = [];
  run(w, 300, 600, log2);
  ok((A.stock.plank | 0) >= 29 || B.stock.plank === 0 || log2.every((e) => !e.cargo.plank), `${seed}: plank went below A's own want ${A.stock.plank}`);
  ok(A.stock.plank >= 29, `${seed}: A plank ${A.stock.plank}`);
}

// Note: 6. determinism: twin runs from scratch end byte-identical, and the logs match.
function checkTwin(seed) {
  const outs = [];
  for (let r = 0; r < 2; r++) {
    const g = build(seed);
    if (!g) return;
    const { w, picks } = g;
    picks[1].want = { stone: 8, plank: 8 }; picks[2].want = { stone: 6, plank: 4 };
    picks[2].special = 'spire'; w.gw = GW.newGw();
    for (const [good, n] of Object.entries(GW.GW_FOUNDATION)) GW.gwDeliver(w.gw, good, n, 1);
    picks[1].stock.moonpearl = 1;
    SH.addCargoShip(w, picks[0].id); SH.addCargoShip(w, picks[0].id); SH.addCargoShip(w, picks[1].id);
    const log = [];
    for (let t0 = 0; t0 < 1200; t0 += 100) {
      run(w, t0, t0 + 100, log);
      // Note: the shelves eat a little every block so the hauls keep coming.
      for (const i of picks.slice(1)) for (const x of ['stone', 'plank']) i.stock[x] = Math.max(0, (i.stock[x] || 0) - 3);
    }
    outs.push(JSON.stringify([log, stateOf(w)]));
    if (r === 0) ok(log.length >= 4, `${seed}: twin run barely flew (${log.length} legs)`);
  }
  ok(outs[0] === outs[1], `${seed}: twin runs differ`);
}

// Note: 7. save and load in flight and on the empty leg: the order or the crates survive and the trip completes; the ledger rebuilds itself.
function checkSaveLoad(seed) {
  const cuts = [];
  const mk = () => {
    const g = build(seed);
    if (!g) return null;
    g.picks[1].want = { stone: 8 }; g.picks[2].want = { stone: 0 };
    SH.addCargoShip(g.w, g.picks[2].id);
    return g;
  };
  { // find the moments: a hull with an order on the empty leg, and one with crates in the air
    const g = mk();
    if (!g) return;
    const log = [];
    let sawEmpty = false; let sawLoaded = false;
    for (let k = 0; k * SIM_DT < 300; k++) {
      run(g.w, k * SIM_DT, (k + 1) * SIM_DT, log);
      const s = g.w.ships[0];
      if (s.order && s.state === 'flight' && !sawEmpty) { sawEmpty = true; cuts.push({ t: (k + 1) * SIM_DT, kind: 'empty' }); }
      if (!s.order && s.state === 'flight' && s.cargo.stone && !sawLoaded) { sawLoaded = true; cuts.push({ t: (k + 1) * SIM_DT, kind: 'loaded' }); }
    }
    ok(cuts.length === 2, `${seed}: moments seen ${JSON.stringify(cuts)}`);
  }
  for (const cut of cuts) {
    const g = mk();
    run(g.w, 0, cut.t, []);
    const json = JSON.parse(JSON.stringify(SH.shipsToJSON(g.w)));
    ok(cut.kind !== 'empty' || json[0].order, `${seed}: order not saved on the empty leg`);
    const c = mk();
    for (const i of g.w.islands.values()) { const o = c.w.islands.get(i.id); if (o) o.stock = JSON.parse(JSON.stringify(i.stock)); }
    c.w.ships = [];
    SH.shipsFromJSON(c.w, json);
    c.w.tripCool = undefined; c.w.ledger = undefined;
    run(c.w, cut.t, 400, []);
    ok(c.picks[1].stock.stone === 8 && sumGood(c.w, 'stone') === 30, `${seed}: restore on the ${cut.kind} leg: B stone ${c.picks[1].stock.stone}, total ${sumGood(c.w, 'stone')}`);
    ok(c.w.ships.every((s) => !s.order && s.state === 'idle'), `${seed}: restore on the ${cut.kind} leg left a ship busy ${c.w.ships.map((s) => s.state + (s.order ? '+order' : ''))}`);
  }
}

// Note: 8. gates: a council below tier 4 gives no orders; planFleet twice in a row books nothing twice.
function checkGates(seed) {
  for (const [name, set] of [['tier 3', (w) => { w.tierForce = 3; }], ['tier 0', (w) => { w.tierForce = 0; }]]) {
    const g = build(seed);
    if (!g) return;
    const { w, picks } = g;
    picks[1].want = { stone: 8 };
    SH.addCargoShip(w, picks[0].id);
    set(w);
    w.time = 10;
    ok(LE.ledgerTick(w) === false && !w.ledger && !w.ships[0].order, `${seed}: ledger ticked under ${name}`);
  }
  const g = build(seed);
  if (!g) return;
  const { w, picks } = g;
  picks[1].want = { stone: 6 };
  SH.addCargoShip(w, picks[0].id); SH.addCargoShip(w, picks[0].id);
  w.time = 12;
  LE.planFleet(w); LE.planFleet(w);
  const orders = w.ships.filter((s) => s.order);
  ok(orders.length === 1 && orders[0].order.goods.stone === 6, `${seed}: two planFleet calls gave ${JSON.stringify(orders.map((s) => s.order))}`);
  ok(w.ledger && w.ledger.at === 1, `${seed}: ledger bucket ${JSON.stringify(w.ledger)}`);
  w.time = 14;
  LE.planFleet(w);
  ok(w.ships.filter((s) => s.order).length === 1, `${seed}: the same bucket planned again`);
}

// Note: 9. the landing party through planFleet: real folk on a dock island, tier 3 by hand, one rare island is reached, explored, awake and keeps its crew.
function partyBuild(seed) {
  rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  w.known.add('navigation'); w.recomputeUnlocked();
  w.tierForce = 3;
  SG.sightAll(w); // Note: the council only sends a party to a sighted island.
  const home = [...w.islands.values()].filter((i) => !i.rare && !i.special && findSite(w, i, 'airdock', null))[0];
  if (!home) return null;
  w.reveal(home, true);
  const site = findSite(w, home, 'airdock', null);
  home.buildings.push({ id: 'airdock', x: site.x, y: site.y, size: 3, dir: site.dir, built: true, flourish: 0, door: site.door });
  w.folk = w.folk.filter((f) => f.isle !== home.id);
  for (let k = 0; k < 6; k++) { const f = createFolk(w, home, site.door.i, site.door.j, 4000); f.stage = 'adult'; f.partner = null; f.passAt = 1e9; w.folk.push(f); }
  home.stock = { ...CO.COLONY.party.kit };
  w.shipAuto = true;
  SH.addCargoShip(w, home.id);
  return { w, home };
}

function stepParty(g, topUp) {
  const w = g.w;
  if (topUp) for (const x of Object.keys(CO.COLONY.party.kit)) g.home.stock[x] = Math.max(g.home.stock[x] || 0, CO.COLONY.party.kit[x]);
  const b = Math.floor(w.time / SEC);
  w.step(SIM_DT);
  if (Math.floor(w.time / SEC) !== b) LE.planFleet(w);
}

function runParty(seed) {
  const g = partyBuild(seed);
  if (!g) return null;
  const { w, home } = g;
  const near = rareIsles(w).sort((a, b) => Math.hypot(a.gx - home.gx, a.gz - home.gz) - Math.hypot(b.gx - home.gx, b.gz - home.gz) || (a.id < b.id ? -1 : 1))[0];
  let started = null; let crew = []; let landed = null; let homeMin = 99; let moored = false;
  for (let k = 0; k < 15000; k++) {
    stepParty(g, started === null);
    const s = w.ships.find((q) => q.colony && q.colony.party);
    if (s && started === null) { started = k; crew = s.colony.crew.slice(); }
    if (started !== null) homeMin = Math.min(homeMin, w.folkOn(home.id).filter((f) => f.stage === 'adult').length);
    if (started !== null && landed === null && crew.every((id) => w.folk.find((f) => f.id === id).isle === near.id && !w.folk.find((f) => f.id === id).aboard)) landed = k;
    if (landed !== null && w.ships.some((q) => q.from === near.id && q.state === 'idle' && !q.colony)) moored = true;
    if (landed !== null && k > landed + 2500) break;
  }
  return { w, home, near, started, crew, landed, homeMin, moored };
}

function checkParty(seed) {
  const r = runParty(seed);
  if (!r) { fail(`${seed}: no party fixture`); return null; }
  const { w, home, near, started, crew, landed, homeMin, moored } = r;
  ok(started !== null && landed !== null, `${seed}: party started ${started} landed ${landed}`);
  ok(crew.length >= 2 && crew.length <= CO.COLONY.party.seats, `${seed}: crew ${crew.length}`);
  ok(homeMin >= CO.COLONY.party.keepAdults, `${seed}: home fell to ${homeMin} adults`);
  ok(near.revealed && near.explored && !isDormant(near), `${seed}: ${near.id} revealed ${near.revealed} explored ${near.explored} asleep ${isDormant(near)}`);
  ok(SH.docksOf(near).length === 1, `${seed}: airdocks on the rare isle ${SH.docksOf(near).length}`);
  ok(w.folkOn(near.id).length >= crew.length - 0 && crew.every((id) => { const f = w.folk.find((q) => q.id === id); return f && f.isle === near.id; }), `${seed}: the party did not stay`);
  ok(moored, `${seed}: the hull never moored as a plain hull at ${near.id}`);
  ok(w.ships.every((s) => !s.colony || s.state !== 'idle'), `${seed}: colony mark left on an idle hull`);
  console.log(`  ${seed}: party of ${crew.length} reached ${near.id} (${near.rareSlot}) at step ${landed}, home min ${homeMin} adults`);
  return { started, landed, crew, near: near.id, stock: JSON.stringify(near.stock), ships: JSON.stringify(SH.shipsToJSON(w)) };
}

function checkPartyTwin(seed) {
  const a = checkPartyQuiet(seed); const b = checkPartyQuiet(seed);
  ok(a && b && a === b, `${seed}: party twin runs differ`);
}
function checkPartyQuiet(seed) {
  const r = runParty(seed);
  return r ? JSON.stringify([r.started, r.landed, r.crew, r.near.id, SH.shipsToJSON(r.w), r.near.stock]) : null;
}

// Note: a save in the air and on the pad: after the load the party still lands, wakes the isle and stays.
function checkPartySave(seed) {
  const g = partyBuild(seed);
  if (!g) return;
  const { w, home } = g;
  const near = rareIsles(w).sort((a, b) => Math.hypot(a.gx - home.gx, a.gz - home.gz) - Math.hypot(b.gx - home.gx, b.gz - home.gz) || (a.id < b.id ? -1 : 1))[0];
  const cuts = {};
  for (let k = 0; k < 15000 && !(cuts.flight && cuts.ground); k++) {
    stepParty(g, !w.ships.some((s) => s.colony));
    const s = w.ships.find((q) => q.colony && q.colony.party);
    for (const st of ['flight', 'ground']) if (s && s.state === st && !cuts[st]) {
      cuts[st] = true;
      const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      w2.tierForce = 3; calm(w2); w2.shipAuto = true;
      const g2 = { w: w2, home: w2.islands.get(home.id) };
      let done = false;
      for (let q = 0; q < 12000 && !done; q++) { stepParty(g2, false); done = w2.ships.some((x) => x.state === 'idle' && x.from === near.id && !x.colony); }
      const n2 = w2.islands.get(near.id);
      ok(done && n2.explored && !isDormant(n2) && SH.docksOf(n2).length === 1, `${seed}: ${st} save: moored ${done}, explored ${n2.explored}`);
      ok(w2.folk.every((f) => !f.aboard) && w2.folkOn(near.id).length >= 2, `${seed}: ${st} save: crew on isle ${w2.folkOn(near.id).length}`);
    }
  }
  ok(cuts.flight && cuts.ground, `${seed}: party states cut ${JSON.stringify(cuts)}`);
}

for (let n = 0; n < seeds; n++) {
  const sd = `LED-${n}`;
  checkBeatsBestHaul(sd); checkPriority(sd); checkRareFetch(sd); checkSlots(sd); checkReserve(sd);
  checkTwin(sd); checkSaveLoad(sd); checkGates(sd);
  checkParty(sd); checkPartySave(sd);
}
checkPartyTwin('LED-0');
console.log(failures ? `${failures} failure(s)` : 'garden ledger check: all ok');
process.exit(failures ? 1 : 0);
