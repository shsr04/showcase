// Note: node check for the endgame wiring (rare islands, airships, Great Work, deeds, visitors); run from the repo root with `node scripts/garden-endgame-check.mjs [seeds] [years]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
const seedRandom = (seed) => { rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7); };
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { DAY_LENGTH, SIM_DT, N } = await import('../public/garden/js/config.js');
const RA = await import('../public/garden/js/rareisles.js');
const EC = await import('../public/garden/js/econ.js');
const SH = await import('../public/garden/js/ships.js');
const GWM = await import('../public/garden/js/greatwork.js');
const EV = await import('../public/garden/js/events.js');
const { createFolk, endTask } = await import('../public/garden/js/folk.js');

const seeds = Number(process.argv[2] || 3);
const years = Number(process.argv[3] || 3);
const YEAR = 12 * DAY_LENGTH;
let failures = 0;
const fail = (m) => { failures++; if (failures <= 30) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

// Note: walks a plain object; JSON.stringify would turn NaN into null and hide it.
function finite(o, path = '', seen = new Set()) {
  if (typeof o === 'number') { if (!Number.isFinite(o)) fail(`non finite ${path}`); return; }
  if (o && typeof o === 'object') {
    if (seen.has(o)) return;
    seen.add(o);
    for (const k of Object.keys(o)) finite(o[k], `${path}.${k}`, seen);
  }
}

const hashOf = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) + str.charCodeAt(i)) >>> 0; return h; };
const fingerprint = (w) => {
  const j = w.toJSON();
  j.folk = j.folk.map((f) => [f.id, f.isle, Math.round(f.x * 50), Math.round(f.z * 50), Math.round(f.age)]);
  return `${w.time.toFixed(1)}:${w.folk.length}:${hashOf(JSON.stringify(j))}`;
};

// Note: a real World with home, the six rare slots and the Spire revealed; nothing else is stepped.
function setup(seed) {
  seedRandom(seed);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(SIM_DT);
  const slots = RA.rareSlots(w.seed);
  const rare = [];
  for (const t of RA.RARE_TRAITS) { const e = slots[t][0]; const isl = w.getIsland(e.gx, e.gz); w.reveal(isl, true); rare.push(isl); }
  const se = slots.spire[0];
  const spire = w.getIsland(se.gx, se.gz);
  w.reveal(spire, true);
  w.planNow(spire);
  // Note: hulls need the navigation craft; the colony check covers how it is learned.
  w.learn(w.getIsland(0, 0), 'navigation');
  w.events.length = 0;
  return { w, rare, spire, home: w.getIsland(0, 0) };
}

const drain = (w, log) => { for (const e of w.events.splice(0)) log.push(e); };

// Note: 1. direct assertions: awaken, planShip, haul, Great Work, old saves.
function checkDirect(seed) {
  const { w, rare, spire } = setup(seed);
  const log = [];
  ok(spire.special === 'spire' && !RA.isDormant(spire), `${seed}: spire state`);
  ok(rare.every((i) => i.rareSlot && RA.isDormant(i)), `${seed}: rare islands not dormant at start`);
  ok(EC.live(spire, 'greatwork').length === 1 && EC.live(spire, 'airdock').length === 1, `${seed}: spire lacks greatwork or airdock`);
  ok(rare.every((i) => EC.live(i, 'airdock').length === 0 && RA.rareDeposits(i).length === 0), `${seed}: dormant island has dock or deposits`);
  for (const i of rare) {
    ok(EC.awakenIsland(w, i) === true, `${seed}: awaken ${i.id}`);
    ok(EC.awakenIsland(w, i) === false, `${seed}: second awaken ${i.id}`);
    w.planNow(i);
    ok(EC.live(i, 'airdock').length === 1, `${seed}: ${i.id} has no airdock after waking`);
    ok(RA.rareDeposits(i).length > 0, `${seed}: ${i.id} has no deposits after waking`);
    ok(typeof i.relic === 'string' && RA.knowRelic(i) === null, `${seed}: ${i.id} relic form`);
    ok(SH.planShip(w, spire, i, 'cargo') !== null, `${seed}: no cargo plan spire to ${i.id}`);
    ok(SH.planShip(w, i, spire, 'cargo') !== null, `${seed}: no cargo plan ${i.id} to spire`);
  }
  drain(w, log);
  ok(log.filter((e) => e.type === 'relic').length === rare.length, `${seed}: relic events ${log.filter((e) => e.type === 'relic').length}`);
  // Note: discover() on a rare island with a string relic must not throw and must not learn anything.
  const before = w.known.size;
  let threw = false;
  try { for (const i of rare) w.discover(i, null); } catch (e) { threw = true; console.error(e); }
  ok(!threw && w.known.size === before, `${seed}: discover on rare island`);

  // Note: haul: a rare good on one island rides a cargo hull to the Spire.
  const a = rare[0];
  const good = RA.RARE_GOOD[a.rareSlot];
  a.stock = { ...a.stock, [good]: 2 };
  let hauled = 0;
  for (let k = 0; k * SIM_DT < 1500; k++) {
    w.step(SIM_DT);
    for (const e of w.events.splice(0)) {
      if (e.type === 'shipland' && e.ship.kind === 'cargo' && e.ship.from === spire.id && (e.ship.cargo[good] || 0) > 0) hauled++;
    }
    if (hauled) break;
  }
  ok(hauled > 0, `${seed}: no crate of ${good} reached the Spire`);
  finite(w.toJSON(), `${seed}.haul`);

  // Note: dock work: two adults on the Spire with a storehouse take crates while a hull loads; the crates are {n: 0}.
  {
    const q = setup(`${seed}-dock`);
    const site = EC.findSite(q.w, q.spire, 'storehouse', null);
    ok(!!site, `${seed}: no storehouse site on the Spire`);
    if (site) {
      EC.startBuilding(q.w, q.spire, 'storehouse', site.x, site.y, { built: true });
      const rareIsl = q.rare[0];
      EC.awakenIsland(q.w, rareIsl); q.w.planNow(rareIsl);
      q.w.events.length = 0;
      const spot = (() => { const c = EC.storehouse(q.spire).door; return [c.i, c.j]; })();
      for (let k = 0; k < 3; k++) {
        const f = createFolk(q.w, q.spire, spot[0], spot[1], 4000);
        f.passAt = 1e12; f.needs.food = 1; f.needs.rest = 1; f.needs.company = 1; f.needs.wonder = 1;
        q.w.folk.push(f);
      }
      q.spire.stock = { ...q.spire.stock, stone: 3, wood: 4 };
      // Note: folk pick dock work only when idle in the short load window, so the task is also forced once to test its body.
      let seen = 0; let carriedGoods = 0; let loaded = false; let forced = false; let armed = true; let crates = 0; let natural = false;
      for (let k = 0; k * SIM_DT < 3600 && !(forced && seen > 0 && crates > 0); k++) {
        q.w.step(SIM_DT);
        q.w.events.length = 0;
        const hull = q.w.ships.find((x) => x.from === q.spire.id && x.state === 'load');
        if (!hull) armed = true;
        if (hull && armed && !(forced && crates > 0)) {
          loaded = true; armed = false; forced = true;
          if (q.w.folk.some((f) => f.task && f.task.type === 'dockwork')) natural = true;
          const door = EC.storehouse(q.spire).door;
          let n = 0;
          for (const f of q.w.folk) {
            if (n >= 2 || f.carry || f.link || f.visitor || f.task && f.task.type === 'dockwork') continue;
            endTask(q.w, f, q.spire);
            f.x = door.i + 0.5; f.z = door.j + 0.5; f.path = null;
            f.task = { type: 'dockwork', phase: 'go', ship: hull.id, t: 0, age: 0 }; n++;
          }
        }
        for (const f of q.w.folk) if (f.task && f.task.type === 'dockwork') { seen++; if (f.carry && f.carry.n !== 0) carriedGoods++; if (f.carry && f.carry.n === 0) crates++; }
      }
      finite(q.w.toJSON(), `${seed}.dock`);
      ok(loaded, `${seed}: no hull ever loaded at the Spire`);
      // Note: a rim airdock can stand on ground the storehouse cannot walk to; porters then fail at once, which is only cosmetic.
      const dd = (q.spire.buildings.find((x) => x && x.id === 'airdock' && x.built) || {}).door;
      const walkable = !!(dd && q.spire.reach && q.spire.reach[dd.j * N + dd.i]);
      if (walkable) ok(seen > 0 && crates > 0, `${seed}: porters never carried a crate (seen ${seen}, crates ${crates}, natural ${natural})`);
      else console.log(`  ${seed}: spire dock door is not reachable from the storehouse; porter crate check skipped`);
      ok(carriedGoods === 0, `${seed}: a porter crate held goods`);
    }
  }

  // Note: Great Work: full stock on the Spire lights the beacon.
  const g = setup(`${seed}-gw`);
  const L = [];
  g.spire.stock = { ...g.spire.stock, stone: 6, plank: 4, brick: 3 };
  for (const r of GWM.GW_RARE) g.spire.stock[r] = 1;
  // Note: worldTick runs inside step here, so the post-step event walk sees gwlit like in the real loop.
  g.w.worldT = 4; g.w.step(SIM_DT);
  drain(g.w, L);
  ok(g.w.gw.lit, `${seed}: great work not lit`);
  ok(L.filter((e) => e.type === 'gwstage').length === 7 && L.filter((e) => e.type === 'gwlit').length === 1, `${seed}: gw events ${L.map((e) => e.type)}`);
  ok(g.w.auroraWait, `${seed}: aurora not requested`);
  g.w.worldT = 4; g.w.step(SIM_DT);
  drain(g.w, L);
  const d = g.w.deck;
  ok(L.some((e) => e.type === 'omen' && e.kind === 'aurora') ? !g.w.auroraWait : g.w.auroraWait && !!(d.omen || d.active), `${seed}: no aurora after the beacon`);
  const j = JSON.parse(JSON.stringify(g.w.toJSON()));
  const g2 = World.fromJSON(j);
  ok(g2.gw.lit && g2.gw.stage.every(Boolean), `${seed}: lit state lost in save`);

  // Note: old saves: no gw, deeds, ships or deck keys.
  const o = JSON.parse(JSON.stringify(w.toJSON()));
  delete o.gw; delete o.deeds; delete o.ships; delete o.deck;
  const old = World.fromJSON(o);
  ok(!old.gw.lit && old.deeds.length >= 0 && Array.isArray(old.ships) && Number.isFinite(old.deck.next), `${seed}: old save state`);
  let threwOld = false;
  try { for (let k = 0; k < 400; k++) old.step(SIM_DT); } catch (e) { threwOld = true; console.error(e); }
  ok(!threwOld, `${seed}: old save run`);
  console.log(`  ${seed}: direct ok, hull landed ${hauled}`);
}

// Note: 2. long run: three years, a mid-run save roundtrip, a key for one rare island, finite state and no starvation.
function longRun(seed, spanYears, verbose) {
  const { w: w0, rare } = setup(seed);
  let w = w0;
  const stat = { shipland: 0, depart: 0, visitors: 0, songs: 0, relics: 0, deeds: 0, discover: 0, teach: 0, vfolk: 0, omen: 0, aftermath: 0, peak: 0, porters: 0 };
  const starve = new Map();
  const total = spanYears * YEAR;
  const keyAt = Math.floor(YEAR * 0.25 / SIM_DT);
  const cutAt = Math.floor(total / 2 / SIM_DT);
  const dayEvery = Math.floor(DAY_LENGTH / SIM_DT);
  let threw = null;
  const t0 = Date.now();
  try {
    for (let k = 1; k * SIM_DT <= total; k++) {
      w.step(SIM_DT);
      for (const e of w.events.splice(0)) {
        if (e.type === 'shipland') stat.shipland++;
        else if (e.type === 'shipdepart') stat.depart++;
        else if (e.type === 'visitor') stat.visitors++;
        else if (e.type === 'song') stat.songs++;
        else if (e.type === 'relic') stat.relics++;
        else if (e.type === 'deed') stat.deeds++;
        else if (e.type === 'discover') stat.discover++;
        else if (e.type === 'teach') stat.teach++;
        else if (e.type === 'vfolk' && e.phase === 'arrive') stat.vfolk++;
        else if (e.type === 'omen') stat.omen++;
        else if (e.type === 'aftermath' && e.phase === 'begin') stat.aftermath++;
      }
      if (k === keyAt) {
        // Note: the first rare island gets its key and a unit of its good, so a hull has something to carry.
        const a = rare[0];
        if (EC.awakenIsland(w, a)) { a.stock = { ...a.stock, [RA.RARE_GOOD[a.rareSlot]]: 2 }; }
        w.events.length = 0;
      }
      for (const f of w.folk) if (f.task && f.task.type === 'dockwork') stat.porters++;
      if (k % 10 === 0) for (const f of w.folk) {
        if (f.visitor) { if (f.visitor.age > f.visitor.max + 1) fail(`${seed}: visitor ${f.id} stuck`); continue; }
        const key = f.id;
        // Note: ventures on a link or abroad never check hunger (old behaviour), so they are skipped.
        const away = f.link || f.guestOf || (f.task && f.task.type === 'cross') || (f.queue && f.queue.type === 'cross');
        if (!away && f.needs.food <= 0.02) starve.set(key, (starve.get(key) || 0) + 10 * SIM_DT); else starve.delete(key);
        if (starve.get(key) > DAY_LENGTH) { const il = w.islands.get(f.isle); fail(`${seed}: folk ${f.id} starved over a day at t=${w.time.toFixed(0)} task ${f.task && f.task.type}/${f.task && f.task.phase} home ${f.home} isle ${f.isle} stock ${JSON.stringify(il && il.stock)}`); starve.delete(key); }
      }
      if (k % dayEvery === 0) {
        const j = w.toJSON();
        finite(j, `${seed}.t${Math.round(w.time)}`);
        ok(j.folk.length === w.folk.filter((f) => !f.visitor).length, `${seed}: visitors in the save`);
        stat.peak = Math.max(stat.peak, w.folk.length);
      }
      if (k === cutAt) {
        // Note: save roundtrip mid run; both twin runs do the same, since fromJSON consumes the RNG.
        const json = JSON.stringify(w.toJSON());
        const w2 = World.fromJSON(JSON.parse(json));
        ok(w2.folk.length === w.folk.filter((f) => !f.visitor).length, `${seed}: folk count after load`);
        ok(JSON.stringify(w2.gw) === JSON.stringify(w.gw) && JSON.stringify(deedsOf(w2)) === JSON.stringify(deedsOf(w)), `${seed}: gw or deeds changed in save`);
        ok(w2.ships.length === w.ships.length, `${seed}: ships ${w.ships.length} -> ${w2.ships.length}`);
        ok(JSON.stringify(w2.deck) === JSON.stringify(w.deck), `${seed}: deck changed in save`);
        for (const i of w.islands.values()) if (i.revealed) { const i2 = w2.islands.get(i.id); ok(i2 && RA.isDormant(i2) === RA.isDormant(i), `${seed}: dormant flag of ${i.id}`); }
        w = w2;
      }
    }
  } catch (e) { threw = e; }
  if (threw) { console.error(threw); fail(`${seed}: threw ${threw.message}`); }
  finite(w.toJSON(), `${seed}.end`);
  const home = w.getIsland(0, 0);
  ok(w.folkOn(home.id).length >= 1, `${seed}: home island empty at the end`);
  ok(w.folk.filter((f) => f.visitor).every((f) => f.visitor.age <= f.visitor.max + 1), `${seed}: stuck visitor at the end`);
  if (verbose) console.log(`  ${seed}: ${years}y ${((Date.now() - t0) / 1000).toFixed(0)}s ${JSON.stringify(stat)} pop ${w.folk.length} fp ${fingerprint(w)}`);
  return { fp: fingerprint(w), stat };
}
const deedsOf = (w) => w.toJSON().deeds;

const only = process.env.ONLY === undefined ? -1 : Number(process.env.ONLY);
for (let s = 0; s < seeds; s++) {
  if (only >= 0 && s !== only) continue;
  const seed = `END-${s}`;
  checkDirect(seed);
}
const runs = [];
for (let s = 0; s < seeds; s++) {
  if (only >= 0 && s !== only) continue;
  const seed = `END-${s}`;
  const r = longRun(seed, years, true);
  runs.push(r);
}
if (only < 0) {
// Note: determinism: the first seed twice through the same procedure.
const twin = longRun('END-0', years, false);
ok(twin.fp === runs[0].fp, `END-0: twin runs differ: ${twin.fp} vs ${runs[0].fp}`);
const sum = (k) => runs.reduce((n, r) => n + r.stat[k], 0);
console.log(`  totals: shiplands ${sum('shipland')}, visitors ${sum('visitors')} + walkers ${sum('vfolk')}, songs ${sum('songs')}, relics ${sum('relics')}, deeds ${sum('deeds')}, porters ${sum('porters')}`);
ok(sum('shipland') > 0, 'no airship ever landed in the long runs');
ok(sum('vfolk') > 0, 'no visitor figure ever appeared');

}
if (failures) { console.error(`garden endgame check: ${failures} failure(s)`); process.exit(1); }
console.log('garden endgame check: all ok');
