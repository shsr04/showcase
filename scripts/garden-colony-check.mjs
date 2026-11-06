// Note: node check for colony flights (colony.js + ships.js); run from the repo root with `node scripts/garden-colony-check.mjs [seeds]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { SIM_DT, N } = await import('../public/garden/js/config.js');
const SH = await import('../public/garden/js/ships.js');
const CO = await import('../public/garden/js/colony.js');
const { docksOf } = SH;
const { createFolk } = await import('../public/garden/js/folk.js');
const { findSite, live } = await import('../public/garden/js/econ.js');
const { rareSlots, RARE_TRAITS, isDormant } = await import('../public/garden/js/rareisles.js');
const { planFleet } = await import('../public/garden/js/ledger.js');
const { sightAll } = await import('../public/garden/js/sighting.js');
const { FLIGHT, buildField, blockedAt, airOf } = await import('../public/garden/js/flight.js');

const seeds = Number(process.argv[2] || 3);
let failures = 0;
const fail = (m) => { failures++; if (failures <= 25) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

const rareIsles = (w) => RARE_TRAITS.map((t) => { const e = rareSlots(w.seed)[t][0]; return w.getIsland(e.gx, e.gz); });
// Note: every rare island explored, so a landing party never steals the hull of a colony test; the council tier is forced by hand (no council is built here).
const calm = (w) => { for (const i of rareIsles(w)) i.explored = true; };
const SEC = 4;

// Note: a world with a dock island of 8 folk (couple, two children, single, three more adults), the kit in stock and an empty neighbour.
function build(seed, opts = {}) {
  rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  if (opts.nav !== false) { w.known.add('navigation'); w.recomputeUnlocked(); }
  w.tierForce = opts.tier ?? 3;
  if (!opts.party) calm(w);
  else sightAll(w); // Note: the council only sends a party to a sighted island.
  // Note: both islands need a rim site; the start island often has none.
  const cand = [...w.islands.values()].filter((i) => !i.rare && !i.special && findSite(w, i, 'airdock', null));
  if (cand.length < 2) return null;
  const home = cand[0];
  const target = cand.slice(1).sort((a, b) => Math.hypot(a.wx - home.wx, a.wz - home.wz) - Math.hypot(b.wx - home.wx, b.wz - home.wz))[0];
  w.reveal(home, true); w.reveal(target, true);
  const site = findSite(w, home, 'airdock', null);
  const b = { id: 'airdock', x: site.x, y: site.y, size: 3, dir: site.dir, built: true, flourish: 0, door: site.door };
  home.buildings.push(b);
  w.folk = w.folk.filter((f) => f.isle !== home.id);
  const mk = (stage, partner, pars) => { const f = createFolk(w, home, site.door.i, site.door.j, stage === 'child' ? 600 : 4000); f.stage = stage; f.pars = pars || null; w.folk.push(f); return f; };
  const mom = mk('adult'); const dad = mk('adult'); mom.sex = 'f'; dad.sex = 'm'; mom.partner = dad.id; dad.partner = mom.id;
  const kids = [mk('child', 0, [mom.id, dad.id]), mk('child', 0, [mom.id, dad.id])];
  const single = mk('adult'); single.partner = null;
  const rest = [mk('adult'), mk('adult'), mk('adult')]; rest.forEach((f) => { f.partner = null; });
  for (const f of w.folk) if (f.isle === home.id) { f.age = f.stage === 'child' ? 600 : 4000; f.passAt = 1e9; }
  const kit = CO.colonyKit();
  for (const g of Object.keys(kit)) home.stock[g] = opts.party ? (CO.COLONY.party.kit[g] || 0) : kit[g] + 5;
  w.shipAuto = true;
  const ship = SH.addCargoShip(w, home.id);
  if (opts.noHull) w.ships = [];
  return { w, home, target, ship, party: [mom, dad, ...kids, single] };
}

function checkFlight(seed) {
  const g = build(seed);
  if (!g) { fail(`${seed}: no rim site for the setup`); return; }
  const { w, home, target, ship } = g;
  let party = [];
  ok(ship, `${seed}: no hull`);
  const kit = CO.colonyKit();
  let started = null; let landed = null; let moored = null;
  const seen = new Set();
  for (let k = 0; k < 20000 && !moored; k++) {
    if (!started && k > 900) break;
    if (!started) for (const g of Object.keys(kit)) home.stock[g] = Math.max(home.stock[g] || 0, kit[g] + 1);
    w.step(SIM_DT);
    for (const s of w.ships) if (s.colony) seen.add(s.state);
    if (!started && w.ships.some((s) => s.colony)) {
      started = k;
      party = w.ships.find((s) => s.colony).colony.crew.map((id) => w.folk.find((f) => f.id === id));
      ok(party.length >= 2 && party.length <= CO.COLONY.seats && party.every(Boolean), `${seed}: crew ${party.length}`);
      const before = { ...home.stock };
      for (const g of Object.keys(kit)) before[g] += kit[g];
      for (const g of Object.keys(kit)) ok(home.stock[g] === before[g] - kit[g], `${seed}: kit ${g} ${before[g]} -> ${home.stock[g]}`);
      ok(party.every((f) => f.aboard), `${seed}: party not aboard`);
      ok(w.folkOn(home.id).every((f) => !f.aboard), `${seed}: folkOn lists aboard folk`);
      ok(w.inboundTo(target.id) === party.length, `${seed}: inbound ${w.inboundTo(target.id)}`);
    }
    if (started && !landed && party.every((f) => !f.aboard)) landed = k;
    if (landed && !moored && w.ships.some((s) => s.state === 'idle' && s.from === target.id)) moored = k;
  }
  ok(started !== null, `${seed}: colony flight never started`);
  ok(landed !== null, `${seed}: crew never landed (${[...seen]})`);
  ok(party.every((f) => f.isle === target.id), `${seed}: crew isles ${party.map((f) => f.isle)}`);
  ok(live(target, 'airdock').length === 1, `${seed}: airdock on target ${live(target, 'airdock').length}`);
  ok(moored !== null, `${seed}: hull never moored (${[...seen]}) dock built ${live(target, 'airdock').map((b) => b.progress)}`);
  ok(seen.has('ground'), `${seed}: hull never sat on the ground`);
  console.log(`  ${seed}: started ${started}, landed ${landed}, moored ${moored}, states ${[...seen]}`);
}

// Note: a save taken in flight or on the ground continues like the straight run: crew, kit and hull survive.
function checkSave(seed) {
  const g = build(seed);
  if (!g) return;
  const { w, target } = g;
  const kit = CO.colonyKit();
  const cuts = { flight: null, ground: null };
  for (let k = 0; k < 20000; k++) {
    if (k < 900) for (const x of Object.keys(kit)) g.home.stock[x] = Math.max(g.home.stock[x] || 0, kit[x] + 1);
    w.step(SIM_DT);
    const c = w.ships.find((s) => s.colony);
    for (const st of Object.keys(cuts)) if (c && c.state === st && !cuts[st]) {
      const json = JSON.parse(JSON.stringify(w.toJSON()));
      const w2 = World.fromJSON(json);
      w2.tierForce = 3; calm(w2);
      cuts[st] = true;
      const aboard = w2.folk.filter((f) => f.aboard).length;
      ok(st === 'flight' ? aboard === c.colony.crew.length && aboard >= 2 : aboard === 0, `${seed}: ${st} save has ${aboard} aboard`);
      ok(w2.ships.some((s) => s.colony && s.state === st), `${seed}: ${st} save lost the colony hull`);
      ok(st !== 'flight' || w2.inboundTo(target.id) === aboard, `${seed}: ${st} save inbound ${w2.inboundTo(target.id)}`);
      let moored = false;
      for (let q = 0; q < 12000 && !moored; q++) { w2.step(SIM_DT); moored = w2.ships.some((s) => s.state === 'idle' && s.from === target.id); }
      ok(moored, `${seed}: ${st} save never moored`);
      ok(w2.folk.every((f) => !f.aboard), `${seed}: ${st} save left folk aboard`);
    }
    if (cuts.flight && cuts.ground) break;
  }
  ok(cuts.flight && cuts.ground, `${seed}: states cut ${JSON.stringify(cuts)}`);
}

function checkGates(seed) {
  { const g = build(seed, { tier: 2 }); if (g) { for (let k = 0; k < 600; k++) g.w.step(SIM_DT); ok(!g.w.ships.some((s) => s.colony), `${seed}: colony below council tier 3`); } }
  { const g = build(seed, { tier: 0 }); if (g) { for (let k = 0; k < 600; k++) g.w.step(SIM_DT); ok(!g.w.ships.some((s) => s.colony), `${seed}: colony without a council`); } }
  { const g = build(seed, { nav: false }); if (g) { for (let k = 0; k < 600; k++) g.g = g.w.step(SIM_DT); ok(!g.w.ships.some((s) => s.colony), `${seed}: colony without navigation`); } }
  { const g = build(seed); if (g) { g.w.folk = g.w.folk.filter((f) => !g.w.folkOn(g.home.id).slice(5).includes(f)); for (let k = 0; k < 600; k++) g.w.step(SIM_DT); ok(!g.w.ships.some((s) => s.colony), `${seed}: colony from a small island`); } }
}

// Note: the party fixture: the home dock island with 8 folk and exactly the party kit, steps run with planFleet on the world clock.
const partyAdults = (w, isl) => w.folkOn(isl.id).filter((f) => f.stage === 'adult').length;
function stepParty(w, g, topUp) {
  const P = CO.COLONY.party;
  if (topUp) for (const x of Object.keys(P.kit)) g.home.stock[x] = Math.max(g.home.stock[x] || 0, P.kit[x]);
  const b = Math.floor(w.time / SEC);
  w.step(SIM_DT);
  if (Math.floor(w.time / SEC) !== b) planFleet(w);
}
const partyHull = (w) => w.ships.find((s) => s.colony && s.colony.party);
const nearestRare = (w, home) => rareIsles(w).sort((a, b) => Math.hypot(a.gx - home.gx, a.gz - home.gz) - Math.hypot(b.gx - home.gx, b.gz - home.gz) || (a.id < b.id ? -1 : 1))[0];

function checkParty(seed, quiet = false) {
  const g = build(seed, { party: true });
  if (!g) { fail(`${seed}: no rim site for the setup`); return null; }
  const { w, home } = g;
  const near = nearestRare(w, home);
  ok(!near.revealed && !near.explored && isDormant(near), `${seed}: rare target must start hidden, unexplored and asleep`);
  const P = CO.COLONY.party;
  let crew = []; let started = null; let landed = null; let moored = null; let hull = null;
  let homeMin = 99; let air = 0; const other = new Set();
  for (let k = 0; k < 20000 && !moored; k++) {
    if (!started && k > 1500) break;
    stepParty(w, g, !started);
    if (!started) { const s = partyHull(w); if (s) { started = k; hull = s; crew = s.colony.crew.map((id) => w.folk.find((f) => f.id === id)); } }
    if (started) {
      homeMin = Math.min(homeMin, partyAdults(w, home));
      air = Math.max(air, w.ships.filter((s) => s.colony && s.state !== 'ground').length);
    }
    for (const s of w.ships) if (s.colony && !s.colony.party) other.add(s.id);
    if (started && landed === null && crew.every((f) => !f.aboard)) landed = k;
    if (landed !== null && w.ships.some((s) => s.state === 'idle' && s.from === near.id && !s.colony)) moored = k;
    if (started === k) {
      ok(hull.to === near.id, `${seed}: party flies to ${hull.to}, nearest rare is ${near.id}`);
      ok(near.revealed, `${seed}: target not revealed at departure`);
      ok(crew.length >= 2 && crew.length <= P.seats && crew.every((f) => f && f.stage === 'adult' && f.aboard === hull.id), `${seed}: crew ${crew.length}`);
      ok(partyAdults(w, home) >= P.keepAdults, `${seed}: home keeps ${partyAdults(w, home)} adults`);
      ok(w.inboundTo(near.id) === crew.length, `${seed}: inbound ${w.inboundTo(near.id)}`);
      ok(!hull.colony.kit || Object.keys(P.kit).every((x) => hull.colony.kit[x] === P.kit[x]), `${seed}: party kit ${JSON.stringify(hull.colony.kit)}`);
      ok(!near.explored, `${seed}: explored before the landing`);
    }
  }
  ok(started !== null, `${seed}: party never started`);
  ok(landed !== null, `${seed}: party never landed`);
  ok(moored !== null, `${seed}: party hull never moored`);
  ok(other.size === 0, `${seed}: an ordinary colony flight started`);
  ok(air <= 1, `${seed}: ${air} colony hulls in the air at once`);
  ok(homeMin >= P.keepAdults, `${seed}: home fell to ${homeMin} adults`);
  ok(near.explored, `${seed}: landing did not mark the island explored`);
  ok(!isDormant(near) && docksOf(near).length === 1, `${seed}: island not awake with one airdock`);
  ok(crew.every((f) => f && f.isle === near.id && !f.aboard), `${seed}: crew isles ${crew.map((f) => f && f.isle)}`);
  ok(hull && w.ships.some((s) => s.id === hull.id && s.from === near.id && !s.colony), `${seed}: hull is no plain hull at the rare isle`);
  ok(rareIsles(w).filter((i) => i.rareSlot && i.explored).length === 1, `${seed}: milestone count`);
  // Note: the party stays: another five minutes with no way home.
  for (let k = 0; k < 3000; k++) stepParty(w, g, false);
  ok(crew.filter((f) => f && w.folk.includes(f)).every((f) => f.isle === near.id), `${seed}: outpost left the island`);
  ok(w.ships.every((s) => !s.colony || s.state === 'ground'), `${seed}: a second flight started`);
  if (!quiet) console.log(`  ${seed}: party ${crew.length} to ${near.id} (${near.rareSlot}), started ${started}, landed ${landed}, moored ${moored}, home min ${homeMin}`);
  return { started, landed, moored, to: near.id, crew: crew.map((f) => f && f.id), stock: JSON.stringify(near.stock) };
}

// Note: keeps the first n adults of the home island and drops everyone else there.
function trim(g, n) {
  const keep = g.w.folkOn(g.home.id).filter((f) => f.stage === 'adult').slice(0, n).map((f) => f.id);
  g.w.folk = g.w.folk.filter((f) => f.isle !== g.home.id || keep.includes(f.id));
}

function checkPartyGates(seed) {
  // Note: true when a party hull was ever seen; the hull loses its colony mark after the landing.
  const run = (g, n = 1500) => { let seen = false; for (let k = 0; k < n; k++) { stepParty(g.w, g, true); if (partyHull(g.w)) seen = true; } return seen; };
  { const g = build(seed, { party: true, tier: 2 }); if (g) ok(!run(g), `${seed}: party below council tier 3`); }
  { const g = build(seed, { party: true, nav: false }); if (g) ok(!run(g), `${seed}: party without navigation`); }
  { const g = build(seed, { party: true }); if (g) { trim(g, 3); ok(!run(g), `${seed}: party from a 3 adult island`); } }
  { const g = build(seed, { party: true }); if (g) { trim(g, 4); const done = run(g); ok(done && partyAdults(g.w, g.home) === 2, `${seed}: four adults must send two (${done}, ${partyAdults(g.w, g.home)} adults left)`); ok(partyAdults(g.w, g.home) >= 2, `${seed}: four-adult home fell to ${partyAdults(g.w, g.home)}`); } }
  { const g = build(seed, { party: true }); if (g) { calm(g.w); ok(!run(g), `${seed}: party to an explored island`); } }
  { const g = build(seed, { party: true }); if (g) { g.home.stock = {}; let seen = false; for (let k = 0; k < 1500; k++) { stepParty(g.w, g, false); g.home.stock.plank = 0; g.home.stock.wood = Math.min(g.home.stock.wood || 0, 3); if (partyHull(g.w)) seen = true; } ok(!seen, `${seed}: party without a kit`); } }
}

function checkPartyDeterminism(seed) {
  const a = checkParty(seed, true); const b = checkParty(seed, true);
  ok(a && b && JSON.stringify(a) === JSON.stringify(b), `${seed}: two party runs differ ${JSON.stringify(a)} ${JSON.stringify(b)}`);
}

// Note: a save taken in flight or on the ground continues: the crew lands, the island wakes, the hull moors.
function checkPartySave(seed) {
  const g = build(seed, { party: true });
  if (!g) return;
  const { w, home } = g;
  const near = nearestRare(w, home);
  const cuts = {};
  for (let k = 0; k < 20000 && !(cuts.flight && cuts.ground); k++) {
    stepParty(w, g, k < 1500 && !partyHull(w));
    const s = partyHull(w);
    for (const st of ['flight', 'ground']) if (s && s.state === st && !cuts[st]) {
      cuts[st] = true;
      const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      w2.tierForce = 3;
      const h2 = partyHull(w2);
      ok(h2 && h2.state === st && h2.colony.party === true && h2.to === near.id, `${seed}: ${st} save lost the party hull`);
      const aboard = w2.folk.filter((f) => f.aboard).length;
      ok(st === 'flight' ? aboard === s.colony.crew.length : aboard === 0, `${seed}: ${st} save has ${aboard} aboard`);
      const n2 = w2.islands.get(near.id);
      ok(n2 && n2.revealed, `${seed}: ${st} save lost the revealed target`);
      let moored = false;
      for (let q = 0; q < 12000 && !moored; q++) { w2.step(SIM_DT); moored = w2.ships.some((x) => x.state === 'idle' && x.from === near.id && !x.colony); }
      ok(moored, `${seed}: ${st} save never moored`);
      ok(n2.explored && !isDormant(n2) && docksOf(n2).length === 1, `${seed}: ${st} save island not explored and awake`);
      ok(w2.folk.every((f) => !f.aboard) && w2.folkOn(n2.id).length >= 2, `${seed}: ${st} save crew did not stay (${w2.folkOn(n2.id).length})`);
    }
  }
  ok(cuts.flight && cuts.ground, `${seed}: party states cut ${JSON.stringify(cuts)}`);
}

// Note: a hull must land on the airdock pad of every rare island; props (columns, arches, posts) lift the clearance field.
function checkLanding(seed) {
  const g = build(seed, { party: true });
  if (!g) return;
  const { w, home } = g;
  const dk = docksOf(home)[0];
  for (const B of rareIsles(w)) {
    w.reveal(B, true);
    const pad = B.rare.sites.airdock;
    const plan = SH.planShip(w, home, B, 'cargo', { dockFrom: dk.k, slotFrom: 0, self: g.ship.id, ground: SH.colonyPoint(B, pad), floor: SH.cruiseFloor() });
    ok(plan, `${seed}: no landing plan to the ${B.rareSlot} pad`);
    if (plan) ok(plan.cruise >= SH.cruiseFloor(), `${seed}: ${B.rareSlot} cruise ${plan.cruise} below the floor`);
    const F = buildField(w);
    const e = F.isls.find((q) => q.isl === B);
    for (const f of B.rare.features) {
      const h = FLIGHT.rareProp[f.kind];
      if (!h) continue;
      const c = f.j * N + f.i;
      ok(e.top[c] >= B.cellH(f.i, f.j) + h - 1e-6, `${seed}: ${B.rareSlot} ${f.kind} at ${f.i},${f.j} does not lift the field`);
    }
  }
}

for (let n = 0; n < seeds; n++) {
  const sd = `COL-${n}`; checkFlight(sd); checkSave(sd); checkGates(sd);
  checkParty(sd); checkPartyGates(sd); checkPartySave(sd); checkLanding(sd);
}
checkPartyDeterminism('COL-0');
console.log(failures ? `${failures} failure(s)` : 'garden colony check: all ok');
process.exit(failures ? 1 : 0);
