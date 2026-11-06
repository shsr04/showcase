// Note: node check for the airship planner and state machine (ships.js); run from the repo root with `node scripts/garden-ship-check.mjs [seeds] [years]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { DAY_LENGTH, SIM_DT, N } = await import('../public/garden/js/config.js');
const SH = await import('../public/garden/js/ships.js');
const EV = await import('../public/garden/js/events.js');
const FL = await import('../public/garden/js/flight.js');
const PIER = await import('../public/garden/js/pier.js');

const seeds = Number(process.argv[2] || 3);
const years = Number(process.argv[3] || 2);
const YEAR = 12 * DAY_LENGTH;
let failures = 0;
const fail = (m) => { failures++; if (failures <= 25) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

function finite(o, path = '') {
  if (typeof o === 'number') { if (!Number.isFinite(o)) fail(`non finite ${path}`); return; }
  if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'isl' || k === 'ship') continue; finite(o[k], `${path}.${k}`); }
}

// Note: a free 3x3 land block on the rim with the flattest ground and a pier direction over the void; null when the island has none.
function landBlock(isl) {
  let best = null;
  for (let y = 0; y + 3 <= N; y++) for (let x = 0; x + 3 <= N; x++) {
    let good = true; let lo = 1e9; let hi = -1e9;
    for (let j = y; j < y + 3 && good; j++) for (let i = x; i < x + 3 && good; i++) {
      if (isl.mask[j * N + i] !== 1) good = false;
    }
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

// Note: a real World with three revealed islands, each with an airdock, stock on the first, wants on the others.
function build(seed, opts = {}) {
  rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  // Note: cargo hulls only fly once navigation is known.
  if (opts.nav !== false) { w.known.add('navigation'); w.recomputeUnlocked(); }
  // Note: council tier by hand; below tier 4 the hulls take the best haul where they rest, as before the ledger.
  w.tierForce = opts.tier ?? 0;
  const home = w.getIsland(0, 0);
  const near = [...w.islands.values()].filter((i) => i !== home).sort((a, b) => Math.hypot(a.wx - home.wx, a.wz - home.wz) - Math.hypot(b.wx - home.wx, b.wz - home.wz));
  const picks = [home, near[0], near[1]];
  for (const i of picks) w.reveal(i, true);
  const docks = [];
  for (const i of picks.slice(0, opts.docks ?? 3)) {
    const spot = landBlock(i);
    if (!spot) { docks.push(null); continue; }
    i.buildings.push({ id: 'airdock', x: spot.x, y: spot.y, size: 3, dir: spot.dir, built: true, flourish: 0, door: { i: spot.x, j: spot.y + 3 } });
    docks.push(i);
  }
  for (const i of picks) { i.stock = { ...i.stock }; }
  home.stock.stone = 30; home.stock.plank = 30; home.stock.moonpearl = 0;
  picks[1].want = { stone: 8, plank: 8 }; picks[2].want = { stone: 6 };
  home.want = {};
  home.rung = opts.rung ?? 4;
  w.ships = [];
  w.time = 0;
  w.events.length = 0;
  return { w, picks, docks };
}

const sumStock = (w, g) => [...w.islands.values()].reduce((n, i) => n + ((i.stock && i.stock[g]) || 0), 0);
const sumCargo = (w, g) => w.ships.reduce((n, s) => n + (s.cargo[g] || 0), 0);

function run(w, from, to, log, dt = SIM_DT, deck = null) {
  // Note: integer step index keeps the clock identical between a straight run and a resumed one.
  for (let k = Math.ceil(from / dt - 1e-9); k * dt < to; k++) {
    const t = k * dt;
    w.time = t;
    const ev = deck ? deck(t, k) : null;
    const out = SH.stepShips(w, dt, ev);
    for (const e of out) {
      const r = { t: Math.round(t * 10) / 10, type: e.type };
      if (e.ship) { r.id = e.ship.id; r.kind = e.ship.kind; r.to = e.ship.to; r.from = e.ship.from; r.cargo = { ...e.ship.cargo }; }
      if (e.isl) r.isl = e.isl.id;
      if (e.reveal) r.reveal = e.reveal;
      if (e.type === 'visitor') r.kind = e.kind;
      if (e.offer) r.offer = JSON.parse(JSON.stringify(e.offer));
      log.push(r);
    }
    for (const s of w.ships) finite(s, `ship${s.id}`);
  }
}

const state = (w) => JSON.stringify({ ships: SH.shipsToJSON(w), stock: [...w.islands.values()].map((i) => [i.id, i.stock]) });

// Note: 1. the plan itself: endpoints, finite numbers and a path that a fresh clearance field accepts.
function checkPlan(seed) {
  const { w, picks, docks } = build(seed);
  ok(docks.every(Boolean), `${seed}: no land block for a dock`);
  if (!docks.every(Boolean)) return;
  const [A, B] = picks;
  const plan = SH.planShip(w, A, B, 'cargo');
  ok(plan, `${seed}: no plan home to neighbour`);
  if (plan) console.log(`  ${seed}: plan ${plan.dur.toFixed(0)} s, cruise ${plan.cruise.toFixed(1)}, relaxed ${plan.relaxed}`);
  if (!plan) return;
  finite(plan, 'plan');
  const dA = SH.docksOf(A)[0]; const dB = SH.docksOf(B)[0];
  const pa = SH.mooring(A, dA.b, plan.slotA); const pb = SH.mooring(B, dB.b, plan.slotB);
  ok(Math.hypot(plan.x0 - pa.x, plan.z0 - pa.z) < 1e-6 && Math.hypot(plan.x1 - pb.x, plan.z1 - pb.z) < 1e-6, `${seed}: plan endpoints are not the docks`);
  ok(plan.dur > plan.tUp + plan.tDown && plan.cruise > plan.y0 && plan.cruise > plan.y1, `${seed}: plan shape`);
  const p0 = SH.posAt(plan, 0); const p1 = SH.posAt(plan, plan.dur);
  ok(Math.abs(p0.y - plan.y0) < 1e-6 && Math.abs(p1.y - plan.y1) < 1e-6, `${seed}: posAt ends`);
  // Note: independent sweep of the cruise leg against a fresh field; the vertical legs sit over the own dock.
  const F = FL.buildField(w);
  for (let tau = plan.tUp; tau <= plan.dur - plan.tDown; tau += 0.5) {
    const p = SH.posAt(plan, tau);
    const air = FL.airOf(Math.max(0, p.y - Math.max(plan.y0, plan.y1)));
    const why = FL.blockedAt(F, p.x, p.y, p.z, air, null, SH.SHIP.relaxMargin);
    if (why && tau > plan.tUp + 1 && tau < plan.dur - plan.tDown - 1) fail(`${seed}: cruise blocked at ${tau.toFixed(1)} by ${why}`);
  }
  // Note: off the map and no free dock give no plan.
  const off = SH.planShip(w, A, null, 'explorer', { ang: 1 });
  ok(off && Math.abs(Math.hypot(off.x1 - off.x0, off.z1 - off.z0) - SH.SHIP.off) < 1e-6 && off.tDown === 0, `${seed}: off-map plan ${JSON.stringify(off)}`);
  const inn = SH.planShip(w, null, A, 'trader', { ang: 2 });
  ok(inn && Math.abs(Math.hypot(inn.x1 - inn.x0, inn.z1 - inn.z0) - SH.SHIP.off) < 1e-6 && inn.tUp === 0, `${seed}: inbound plan ${JSON.stringify(inn)}`);
  ok(SH.planShip(w, A, 'nope', 'cargo') === null, `${seed}: unknown island must give null`);
  const none = w.getIsland(5, 5);
  ok(SH.planShip(w, A, none, 'cargo') === null, `${seed}: island without dock must give null`);
}

// Note: 2. the cargo cycle over simulated years: determinism, conservation, cap, delivery, no NaN.
function checkCycle(seed) {
  const logs = [];
  const finals = [];
  for (let r = 0; r < 2; r++) {
    const { w, picks } = build(seed);
    const log = [];
    const g0 = { stone: sumStock(w, 'stone'), plank: sumStock(w, 'plank') };
    let maxCargo = 0; let maxShips = 0;
    const span = years * YEAR;
    let eaten = { stone: 0, plank: 0 };
    for (let t0 = 0; t0 < span; t0 += 100) {
      run(w, t0, t0 + 100, log);
      // Note: the wanting islands eat up to 3 of each good per block, so hauls keep coming.
      for (const i of picks.slice(1)) for (const g of ['stone', 'plank']) { const n = Math.min(3, (i.stock[g] || 0)); i.stock[g] = (i.stock[g] || 0) - n; eaten[g] += n; }
      for (const s of w.ships) { maxCargo = Math.max(maxCargo, SH.SHIP && Object.values(s.cargo).reduce((n, v) => n + v, 0)); }
      maxShips = Math.max(maxShips, w.ships.length);
      for (const g of ['stone', 'plank']) ok(sumStock(w, g) + sumCargo(w, g) + eaten[g] === g0[g], `${seed}: ${g} not conserved at ${t0} (${sumStock(w, g)} + ${sumCargo(w, g)} vs ${g0[g]})`);
    }
    ok(maxCargo <= SH.SHIP.cap, `${seed}: cargo ${maxCargo} over cap`);
    ok(maxShips >= 1 && maxShips <= SH.SHIP.maxCargo, `${seed}: ${maxShips} ships`);
    const lands = log.filter((e) => e.type === 'shipland');
    const deps = log.filter((e) => e.type === 'shipdepart');
    ok(deps.length >= 2 && lands.length >= 2, `${seed}: ${deps.length} departures, ${lands.length} landings`);
    ok(deps.length - lands.length <= SH.SHIP.maxCargo && deps.length >= lands.length, `${seed}: departures ${deps.length} landings ${lands.length}`);
    ok(eaten.stone + eaten.plank > 0, `${seed}: nothing was delivered`);
    const stateOrder = new Set(w.ships.map((s) => s.state));
    for (const s of w.ships) ok(SH.SHIP_STATES.includes(s.state) && SH.SHIP_KINDS.includes(s.kind), `${seed}: bad ship ${s.state}/${s.kind}`);
    logs.push(JSON.stringify(log));
    finals.push(state(w));
    if (r === 0) console.log(`  ${seed}: ${deps.length} departures, ${lands.length} landings, ${[...stateOrder].join('/')}, stone ${picks.map((i) => i.stock.stone | 0).join('/')}`);
  }
  ok(logs[0] === logs[1] && finals[0] === finals[1], `${seed}: two runs differ`);
}

// Note: 3. save roundtrip: restoring the ship list at any moment continues exactly like the straight run.
function checkRoundtrip(seed) {
  const cuts = [];
  { // find moments in each state on a straight run
    const { w } = build(seed);
    const seen = new Set();
    for (let k = 0; k * SIM_DT < 600; k++) {
      w.time = k * SIM_DT;
      SH.stepShips(w, SIM_DT, null);
      for (const s of w.ships) if (!seen.has(s.state)) { seen.add(s.state); cuts.push({ t: k * SIM_DT, state: s.state }); }
    }
  }
  ok(cuts.some((c) => c.state === 'flight') && cuts.some((c) => c.state === 'unload') && cuts.some((c) => c.state === 'load'), `${seed}: states seen ${cuts.map((c) => c.state)}`);
  const straight = build(seed); const slog = [];
  run(straight.w, 0, 700, slog);
  for (const cut of cuts) {
    const b = build(seed); const log = [];
    run(b.w, 0, cut.t + SIM_DT, log);
    const json = JSON.stringify(SH.shipsToJSON(b.w));
    const clone = build(seed);
    // Note: the restore target is a fresh world with the same stock as the cut moment.
    for (const i of b.w.islands.values()) { const o = clone.w.islands.get(i.id); if (o) { o.stock = JSON.parse(JSON.stringify(i.stock)); } }
    clone.w.ships = [];
    SH.shipsFromJSON(clone.w, JSON.parse(json));
    const rest = [];
    run(clone.w, cut.t + SIM_DT, 700, rest);
    run(b.w, cut.t + SIM_DT, 700, log);
    ok(state(clone.w) === state(b.w), `${seed}: restore at ${cut.state} t=${cut.t.toFixed(1)} differs`);
    ok(JSON.stringify(rest) === JSON.stringify(log.filter((e) => e.t > cut.t + SIM_DT / 2)), `${seed}: restore at ${cut.state} logs differ`);
  }
  ok(state(straight.w).length > 20, `${seed}: state empty`);
  // Note: garbage and old saves.
  const g = build(seed);
  SH.shipsFromJSON(g.w, [null, 5, { id: 1, kind: 'blimp', state: 'idle', t: 0 }, { id: 2, kind: 'cargo', state: 'flight', t: 0, plan: null }, { id: 3, kind: 'cargo', state: 'idle', t: 0, from: 'ghost' }, { id: 4, kind: 'cargo', state: 'idle', t: 'x' }]);
  ok(g.w.ships.length === 0, `${seed}: garbage ships kept: ${g.w.ships.length}`);
  SH.shipsFromJSON(g.w, undefined);
  ok(Array.isArray(g.w.ships) && g.w.ships.length === 0, `${seed}: undefined save`);
  SH.initShips(g.w);
}

// Note: 4. visitors: merchant swap, frigate gate, explorer pointer, hold, unrevealed never offered.
function checkVisitors(seed) {
  const rare = (w, i) => ({ type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'trader', isl: i.id }, until: 1e9 });
  { // merchant
    const { w, picks } = build(seed);
    const [home, a, b] = picks;
    w.shipAuto = false;
    b.traits = [...b.traits.filter((t) => t !== 'misty'), 'misty'];
    const hidden = [...w.islands.values()].find((i) => !i.revealed);
    if (hidden) hidden.traits = [...hidden.traits.filter((t) => t !== 'crystal'), 'crystal'];
    const offers = SH.rareOffers(w);
    ok(offers.some((o) => o.good === 'moonpearl' && o.from === b.id), `${seed}: moonpearl not offered`);
    ok(!hidden || !offers.some((o) => o.good === 'prism' && o.from === hidden.id), `${seed}: unrevealed island offered`);
    for (const o of offers) ok(w.islands.get(o.from).revealed, `${seed}: offer from unrevealed ${o.from}`);
    const before = JSON.stringify(home.stock);
    const log = [];
    run(w, 0, 400, log, SIM_DT, (t, k) => (k === 0 ? [rare(w, home)] : null));
    const vis = log.find((e) => e.type === 'visitor' && e.kind === 'merchant');
    ok(vis, `${seed}: merchant never landed (${log.map((e) => e.type)})`);
    if (vis) {
      ok(vis.offer && vis.offer.get.good && vis.offer.give.n === 2, `${seed}: merchant offer ${JSON.stringify(vis.offer)}`);
      ok(w.islands.get(vis.offer.get.from).revealed, `${seed}: merchant good from unrevealed`);
      const want = JSON.parse(before);
      want[vis.offer.give.good] -= vis.offer.give.n;
      want[vis.offer.get.good] = (want[vis.offer.get.good] || 0) + 1;
      ok(JSON.stringify(home.stock, Object.keys(want).sort()) === JSON.stringify(want, Object.keys(want).sort()) && Object.keys(home.stock).length === Object.keys(want).length, `${seed}: swap deltas ${JSON.stringify(home.stock)} vs ${JSON.stringify(want)}`);
    }
    ok(w.ships.length === 0, `${seed}: merchant did not leave (${w.ships.map((s) => s.state)})`);
  }
  { // frigate gate and gift
    const { w, picks } = build(seed, { rung: 3 });
    w.shipAuto = false;
    ok(SH.shipOnEvent(w, { type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'military', isl: picks[0].id } }) === null, `${seed}: frigate below rung 4`);
    picks[0].rung = 4;
    picks[1].traits = [...picks[1].traits, 'springs'];
    const log = [];
    const before = JSON.stringify(picks[0].stock);
    run(w, 0, 400, log, SIM_DT, (t, k) => (k === 0 ? [{ type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'military', isl: picks[0].id } }] : null));
    const vis = log.find((e) => e.type === 'visitor' && e.kind === 'frigate');
    ok(vis && vis.offer && vis.offer.give === null && vis.offer.get.good && w.islands.get(vis.offer.get.from).revealed, `${seed}: frigate gift ${JSON.stringify(vis)}`);
    if (vis && vis.offer) {
      const want = JSON.parse(before);
      want[vis.offer.get.good] = (want[vis.offer.get.good] || 0) + 1;
      ok(JSON.stringify(picks[0].stock, Object.keys(want).sort()) === JSON.stringify(want, Object.keys(want).sort()) && Object.keys(picks[0].stock).length === Object.keys(want).length, `${seed}: frigate deltas ${JSON.stringify(picks[0].stock)}`);
    }
    ok(w.ships.length === 0, `${seed}: frigate did not leave`);
  }
  { // explorer
    const { w, picks } = build(seed);
    w.shipAuto = false;
    const before = [...w.islands.values()].filter((i) => i.revealed).length;
    const log = [];
    run(w, 0, 300, log, SIM_DT, (t, k) => (k === 0 ? [{ type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'explorer', isl: picks[0].id } }] : null));
    const land = log.find((e) => e.type === 'shipland' && e.kind === 'explorer');
    ok(land, `${seed}: explorer never landed`);
    ok(land && land.reveal && land.reveal.length === 1 && w.islands.has(land.reveal[0]) && !w.islands.get(land.reveal[0]).revealed, `${seed}: explorer reveal ${land && JSON.stringify(land.reveal)}`);
    ok([...w.islands.values()].filter((i) => i.revealed).length === before, `${seed}: ships.js must not reveal islands`);
    ok(w.ships.length === 0, `${seed}: explorer stayed`);
  }
  { // no dock, no visitor; a blocked dock holds the ship until it gives up
    const { w, picks } = build(seed, { docks: 0 });
    w.shipAuto = false;
    ok(SH.shipOnEvent(w, { type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'trader', isl: picks[0].id } }) === null, `${seed}: visitor without a dock`);
    ok(w.ships.length === 0, `${seed}: ship without dock`);
  }
  { // cargo ship resting on the only dock: visitor holds, then leaves the list
    const { w, picks } = build(seed, { docks: 1 });
    w.shipAuto = false;
    SH.addCargoShip(w, picks[0].id);
    SH.addCargoShip(w, picks[0].id);
    ok(w.ships.length === 2 && w.ships[0].slot !== w.ships[1].slot, `${seed}: two hulls must share one dock on both sides`);
    ok(SH.addCargoShip(w, picks[0].id) === null || w.ships.length === 2, `${seed}: third hull on a two-slot dock`);
    const s = SH.shipOnEvent(w, { type: 'event', kind: 'rareship', phase: 'start', data: { ship: 'trader', isl: picks[0].id } });
    ok(s && s.state === 'hold', `${seed}: visitor should hold on a busy dock (${s && s.state})`);
    run(w, 0, SH.SHIP.holdMax + 40, []);
    ok(!w.ships.some((q) => q.kind === 'trader'), `${seed}: held visitor never gave up`);
    ok(w.ships.some((q) => q.kind === 'cargo'), `${seed}: cargo ship lost`);
  }
  { // load that cannot depart: crates return to the shelf
    const { w, picks } = build(seed, { docks: 3 });
    w.shipAuto = false;
    const s = SH.addCargoShip(w, picks[0].id);
    const stone = picks[0].stock.stone;
    picks[0].stock.stone -= 3;
    Object.assign(s, { state: 'load', cargo: { stone: 3 }, to: picks[1].id, t: 999, fails: SH.SHIP.giveUp });
    run(w, 0, 0.2, []);
    ok(s.state === 'idle' && picks[0].stock.stone === stone, `${seed}: give-up did not return crates (${s.state}, ${picks[0].stock.stone}/${stone})`);
  }
  { // full shelf: unloading waits, then the overflow is lost; the cap holds
    const { w, picks } = build(seed);
    w.shipAuto = false;
    picks[1].stock.stone = SH.STOCK_CAP;
    const s = SH.addCargoShip(w, picks[1].id);
    Object.assign(s, { state: 'unload', cargo: { stone: 2 }, t: 0 });
    run(w, 0, SH.SHIP.unload + 2, []);
    ok(s.cargo.stone === 2 && picks[1].stock.stone === SH.STOCK_CAP, `${seed}: full shelf overflowed`);
    let t = SH.SHIP.unload + 2;
    while (s.state === 'unload' && t < 200) { w.time = t; SH.stepShips(w, SIM_DT, null); t += SIM_DT; }
    ok(s.state === 'idle' && s.cargo.stone === undefined && picks[1].stock.stone === SH.STOCK_CAP, `${seed}: overflow after wait (${s.state}, stock ${picks[1].stock.stone})`);
    ok(t >= SH.SHIP.unload + SH.SHIP.dumpAfter - 0.5, `${seed}: dumped too early at ${t}`);
  }
  { // rare good to the Spire: carried once, never twice
    const { w, picks } = build(seed);
    picks[2].special = 'spire'; picks[2].want = {}; picks[1].want = {};
    picks[0].stock.moonpearl = 1;
    const log = [];
    run(w, 0, 400, log);
    ok(picks[2].stock.moonpearl === 1 && picks[0].stock.moonpearl === 0 && sumStock(w, 'moonpearl') + sumCargo(w, 'moonpearl') === 1, `${seed}: spire delivery ${picks.map((i) => i.stock.moonpearl)}`);
    run(w, 400, 800, log);
    ok(sumStock(w, 'moonpearl') + sumCargo(w, 'moonpearl') === 1 && picks[2].stock.moonpearl === 1, `${seed}: spire good duplicated or lost`);
  }
  { // wiring with the real deck: every rareship start with a free dock spawns exactly one hull
    const { w, picks } = build(seed);
    w.shipAuto = false;
    EV.initDeck(w);
    let starts = 0; let spawned = 0; let inject = false;
    for (let k = 0; k * SIM_DT < 2 * YEAR; k++) {
      w.time = k * SIM_DT;
      const dev = EV.stepDeck(w, SIM_DT);
      const rs0 = dev.filter((e) => e.type === 'event' && e.kind === 'rareship' && e.phase === 'start');
      const before = w.ships.length;
      SH.stepShips(w, SIM_DT, dev);
      starts += rs0.length;
      if (rs0.length) { spawned += w.ships.length - before; ok(!rs0[0].data.ship || ['trader', 'explorer', 'military'].includes(rs0[0].data.ship), `${seed}: rareship data ${JSON.stringify(rs0[0].data)}`); }
    }
    totalStarts += starts;
    ok(spawned === starts, `${seed}: ${starts} rareship starts but ${spawned} hulls`);
    ok(w.ships.every((s) => Number.isFinite(s.t)), `${seed}: deck wiring NaN`);
  }
}

// Note: 5. fleet rules: hull cap and lease, a free mooring per dock island, orders (deadhead first), the save of an order, the tier gate.
function checkFleet(seed) {
  { // cap and lease
    const { w } = build(seed);
    ok(SH.maxCargo(w) === SH.SHIP.maxCargo, `${seed}: cap ${SH.maxCargo(w)}`);
    w.time = 10; w.fleetLease = { until: 100, extra: 3 };
    ok(SH.maxCargo(w) === SH.SHIP.maxCargo + 3, `${seed}: leased cap ${SH.maxCargo(w)}`);
    w.time = 100;
    ok(SH.maxCargo(w) === SH.SHIP.maxCargo, `${seed}: lease did not end`);
    w.fleetLease = { until: 'x', extra: 9 };
    ok(SH.maxCargo(w) === SH.SHIP.maxCargo, `${seed}: garbage lease`);
  }
  for (const docks of [1, 2, 3]) { // every dock island keeps one mooring free for a party hull
    const { w, picks } = build(seed, { docks });
    let n = 0;
    for (let k = 0; k * SIM_DT < 200; k++) {
      w.time = k * SIM_DT;
      SH.stepShips(w, SIM_DT, null);
      // Note: the rule holds at the moment a hull appears, not later when hulls queue for a dock.
      if (w.ships.length > n) {
        n = w.ships.length;
        const s = w.ships[w.ships.length - 1];
        ok(SH.slotsFree(w, s.from, 0) >= 1, `${seed}: hull ${s.id} took the last mooring of ${s.from} (${docks} docks)`);
      }
    }
    ok(n >= 1 && n <= Math.min(SH.SHIP.maxCargo, docks * 2 - docks), `${seed}: ${n} hulls on ${docks} dock islands`);
  }
  { // an order: sail empty to the pick-up dock, load the reserved crates, deliver; the ledger flag gates it
    const { w, picks } = build(seed, { tier: 4 });
    const [A, B, C] = picks;
    w.shipAuto = false;
    const hull = SH.addCargoShip(w, C.id);
    w.ledger = { at: 0 };
    hull.order = { from: A.id, to: B.id, goods: { stone: 4 }, t: 0 };
    const a0 = A.stock.stone; const b0 = B.stock.stone || 0;
    const log = [];
    run(w, 0, 400, log);
    const deps = log.filter((e) => e.type === 'shipdepart');
    ok(deps.length >= 2 && deps[0].from === C.id && deps[0].to === A.id && Object.keys(deps[0].cargo).length === 0, `${seed}: first leg is not an empty sail to the pick-up dock ${JSON.stringify(deps[0])}`);
    ok(deps[1] && deps[1].from === A.id && deps[1].to === B.id && deps[1].cargo.stone === 4, `${seed}: second leg ${JSON.stringify(deps[1])}`);
    ok(A.stock.stone === a0 - 4 && (B.stock.stone || 0) === b0 + 4 && !hull.order, `${seed}: order result A ${A.stock.stone}/${a0} B ${B.stock.stone}/${b0} order ${JSON.stringify(hull.order)}`);
    ok(deps.length === 2 && hull.state === 'idle', `${seed}: idle hull without an order moved on (${deps.length} legs, ${hull.state})`);
  }
  { // an order below tier 4, or before the first ledger tick, is dropped and the hull takes the best haul
    for (const mode of ['tier', 'ledger']) {
      const { w, picks } = build(seed, { tier: mode === 'tier' ? 3 : 4 });
      w.shipAuto = false;
      const hull = SH.addCargoShip(w, picks[0].id);
      if (mode === 'tier') w.ledger = { at: 0 };
      hull.order = { from: picks[1].id, to: picks[2].id, goods: { stone: 2 }, t: 0 };
      const log = [];
      run(w, 0, 60, log);
      const dep = log.find((e) => e.type === 'shipdepart');
      if (mode === 'tier') ok(!hull.order && dep && dep.from === picks[0].id && dep.to === picks[1].id, `${seed}: tier 3 kept the order ${JSON.stringify(dep)}`);
      else ok(dep && dep.from === picks[0].id && dep.to === picks[1].id, `${seed}: no ledger, no best haul ${JSON.stringify(dep)}`);
    }
  }
  { // give-up on the empty leg drops the order and cools the pair
    const { w, picks } = build(seed, { tier: 4 });
    w.shipAuto = false;
    const s = SH.addCargoShip(w, picks[0].id);
    w.ledger = { at: 0 };
    Object.assign(s, { state: 'load', cargo: {}, to: picks[1].id, t: 999, fails: SH.SHIP.giveUp, order: { from: picks[1].id, to: picks[2].id, goods: { stone: 1 }, t: 0 } });
    run(w, 0, 0.2, []);
    ok(!s.order && w.tripCool && w.tripCool[`${picks[0].id}>${picks[1].id}`] > w.time, `${seed}: give-up kept the order or did not cool (${JSON.stringify(w.tripCool)})`);
  }
  { // orders and the party flag survive a save; garbage is dropped
    const { w, picks } = build(seed, { tier: 4 });
    w.shipAuto = false;
    const s = SH.addCargoShip(w, picks[0].id);
    s.order = { from: picks[1].id, to: picks[2].id, goods: { stone: 2, plank: 1 }, t: 5 };
    const back = SH.shipsFromJSON(w, JSON.parse(JSON.stringify(SH.shipsToJSON(w))));
    ok(JSON.stringify(back[0].order) === JSON.stringify(s.order), `${seed}: order lost ${JSON.stringify(back[0] && back[0].order)}`);
    const raw = JSON.parse(JSON.stringify(SH.shipsToJSON(w)));
    raw[0].order = { from: 'ghost', to: picks[2].id, goods: { stone: 1 }, t: 0 };
    ok(SH.shipsFromJSON(w, raw)[0].order === undefined, `${seed}: order with a ghost island kept`);
    raw[0].order = { from: picks[1].id, to: picks[2].id, goods: { stone: -2, plank: 1.5, wood: 3 }, t: 'x' };
    const o = SH.shipsFromJSON(w, raw)[0].order;
    ok(o && Object.keys(o.goods).join() === 'wood' && o.t === 0, `${seed}: order goods not cleaned ${JSON.stringify(o)}`);
    const s2 = SH.shipsToJSON(w);
    ok(!s2.some((q) => 'party' in q || (q.colony && 'party' in q.colony)), `${seed}: party field on a plain hull`);
    const g = SH.addCargoShip(w, picks[1].id);
    Object.assign(g, { state: 'ground', colony: { crew: [1], kit: { wood: 1 }, site: { x: 3, y: 3, dir: 0, door: { i: 3, j: 6 }, party: true }, party: true } });
    const rt = SH.shipsFromJSON(w, JSON.parse(JSON.stringify(SH.shipsToJSON(w))));
    ok(rt.find((q) => q.id === g.id).colony.party === true, `${seed}: party flag lost on a ground hull`);
    SH.shipsFromJSON(w, [{ id: 9, kind: 'cargo', state: 'ground', t: 0, from: 'ghost', colony: { crew: [], site: { x: 1, y: 1 } } }]);
    ok(w.ships.length === 0, `${seed}: ground hull on a ghost island kept`);
  }
  { // the floor keeps the cruise above fog
    const { w, picks } = build(seed);
    const low = SH.planShip(w, picks[0], picks[1], 'cargo');
    const high = SH.planShip(w, picks[0], picks[1], 'cargo', { floor: SH.cruiseFloor() });
    ok(low && high && high.cruise >= SH.cruiseFloor() && high.cruise >= low.cruise, `${seed}: floor ${high && high.cruise} vs ${low && low.cruise}`);
  }
}

let totalStarts = 0;
for (let s = 0; s < seeds; s++) {
  const seed = `SHIP-${s}`;
  checkPlan(seed);
  checkCycle(seed);
  checkRoundtrip(seed);
  checkVisitors(seed);
  checkFleet(seed);
}

ok(totalStarts > 0, 'no rareship start in any deck run');
console.log(`  deck wiring: ${totalStarts} rareship starts`);
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('garden ship check: all ok');
