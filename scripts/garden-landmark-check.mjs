// Note: stub-world node check of landmark, dormancy, deposit and Spire planner paths in econ.js and island.js.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-landmark-check.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const { generateIsland } = await J('island.js');
const CFG = await J('config.js');
const E = await J('econ.js');
const RI = await J('rareisles.js');
const GW = await J('greatwork.js');
const { pierDirs } = await J('pier.js');

let failures = 0; let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) { failures++; if (failures < 40) console.error('FAIL:', m); } };

const RARE_ONLY = ['volcanic', 'springs', 'frozen', 'arid'];
const SEED = 4242;

// Note: random islands never carry the four rare-only traits.
for (let seed = 1; seed <= 20; seed++) {
  for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
    if (!gx && !gz) continue;
    if (RI.slotAt(seed * 101, gx, gz)) continue;
    const isl = generateIsland(seed * 101, gx, gz);
    for (const t of RARE_ONLY) ok(!isl.has(t), `seed ${seed} ${gx},${gz} has ${t}`);
  }
}

function stubWorld(seed) {
  return {
    seed, time: 100, islands: new Map(), links: [], unlocked: new Set(), events: [], gw: GW.newGw(), folk: [],
    emit(ev) { this.events.push(ev); },
    folkOn(id) { return this.folk.filter((f) => f.isle === id); },
  };
}
function addFolk(w, isl, n) {
  for (let k = 0; k < n; k++) w.folk.push({ isle: isl.id, mood: 0.7, stage: 'adult', partner: null, x: 12, z: 12 });
}
function enter(w, isl, pop, rung) {
  w.islands.set(isl.id, isl); isl.revealed = true; isl.rung = rung;
  addFolk(w, isl, pop);
}
// Note: puts a built storehouse on a free site and fills the stock with every common good.
function settle(w, isl) {
  const site = E.findSite(w, isl, 'storehouse', null);
  ok(!!site, `${isl.id} storehouse site`);
  if (!site) return false;
  E.startBuilding(w, isl, 'storehouse', site.x, site.y, { built: true });
  for (const g of Object.keys(CFG.GOODS)) if (!CFG.RARE_GOODS.includes(g)) isl.stock[g] = 30;
  return true;
}
function rounds(w, isl, n) {
  for (let k = 0; k < n; k++) {
    E.planIsland(w, isl);
    for (const b of isl.buildings) if (b && !b.gone && !b.built) { b.built = true; b.progress = 1; }
    // Note: refill so cost never blocks the check.
    for (const g of Object.keys(CFG.GOODS)) if (!CFG.RARE_GOODS.includes(g)) isl.stock[g] = Math.max(isl.stock[g] || 0, 30);
  }
}
const landmarksOf = (isl) => E.live(isl).filter((b) => CFG.BUILDINGS[b.id].role === 'landmark');
const rareSample = (trait) => {
  const slot = RI.rareSlots(SEED)[trait][0];
  const isl = generateIsland(SEED, slot.gx, slot.gz);
  RI.rareTerrain(isl, trait);
  return isl;
};

// Note: common landmarks: each common trait yields its landmark once.
const COMMON = Object.entries(CFG.LANDMARKS).filter(([, d]) => !d.rare).map(([id, d]) => [d.trait, id]);
ok(COMMON.length >= 1, 'common landmarks exist');
for (const [trait, id] of COMMON) {
  const found = [];
  for (let s = 0; s < 60 && found.length < 5; s++) {
    for (let gx = 1; gx < 8 && found.length < 5; gx++) {
      if (RI.slotAt(SEED + s, gx, 1)) continue;
      const c = generateIsland(SEED + s, gx, 1);
      if (c.has(trait) && E.landmarkFor(c) === id && c.landCount >= 250) found.push([c, stubWorld(SEED + s)]);
    }
  }
  ok(found.length >= 3, `found islands with ${trait}`);
  let placed = 0;
  for (const [isl, w] of found) {
    enter(w, isl, 4, 3);
    if (!settle(w, isl)) continue;
    rounds(w, isl, 8);
    ok(landmarksOf(isl).length <= 1, `${trait}: at most one landmark`);
    rounds(w, isl, 3);
    ok(landmarksOf(isl).length <= 1, `${trait}: still at most one`);
    if (landmarksOf(isl).length === 1 && isl.landmark === id) {
      placed++;
      const def = CFG.BUILDINGS[id];
      if (def.recipe) ok((isl.want[Object.keys(def.recipe.out)[0]] || 0) > 0, `${trait}: wants its good`);
    }
  }
  // Note: a stalled pad or a cramped island may block a few; most must place.
  ok(placed >= Math.ceil(found.length * 0.6), `${trait}: ${id} placed on ${placed} of ${found.length}`);
}

// Note: ordinary misty or crystal islands never plan a rare landmark.
for (const trait of ['misty', 'crystal']) {
  let n = 0;
  for (let s = 0; s < 40; s++) for (let gx = 1; gx < 8; gx++) {
    if (RI.slotAt(SEED + s, gx, 2)) continue;
    const c = generateIsland(SEED + s, gx, 2);
    if (!c.has(trait)) continue;
    n++;
    const lm = E.landmarkFor(c);
    ok(!lm || !CFG.BUILDINGS[lm].rare, `ordinary ${trait} island picks no rare landmark`);
  }
  ok(n > 0, `ordinary ${trait} islands exist`);
}

// Note: rare islands: dormant skip, awake dock, landmark on its pad, deposits, luxury gating, save round trip.
for (const trait of RI.RARE_TRAITS) {
  const good = CFG.TRAIT_RARE_GOOD[trait];
  const lm = CFG.TRAIT_LANDMARK[trait];
  ok(!!lm, `${trait}: has a landmark`);
  const w = stubWorld(SEED);
  const isl = rareSample(trait);
  enter(w, isl, 4, 3);
  ok(isl.dormant && RI.isDormant(isl), `${trait}: dormant at start`);
  ok(E.landmarkFor(isl) === null, `${trait}: no landmark while dormant`);
  if (!settle(w, isl)) continue;
  rounds(w, isl, 5);
  ok(!E.live(isl).some((b) => CFG.BUILDINGS[b.id].role === 'landmark' || b.id === 'airdock'), `${trait}: dormant builds no landmark or dock`);
  ok(!(isl.want && isl.want[good]), `${trait}: dormant wants no ${good}`);
  const dep = isl.rare.deposits.find((d) => d.n > 0 && isl.bld[d.j * 24 + d.i] < 0);
  ok(!!dep, `${trait}: a free deposit`);
  ok(!E.resourceAt(isl, dep.i, dep.j), `${trait}: dormant deposit hidden`);

  // Note: the first check on awaken before the key, then the key.
  ok(E.awakenIsland(w, isl) === true, `${trait}: awaken`);
  ok(!isl.dormant && isl.relic === RI.relicKey(trait), `${trait}: awake with key`);
  ok(w.events.some((e) => e.type === 'relic' && e.isl === isl), `${trait}: relic event`);
  ok(E.awakenIsland(w, isl) === false, `${trait}: second awaken is a no-op`);
  const dock = E.live(isl, 'airdock')[0];
  ok(dock && dock.built, `${trait}: free airdock`);
  ok(dock && isl.rare.sites.airdock && dock.x === isl.rare.sites.airdock.x && dock.y === isl.rare.sites.airdock.y, `${trait}: airdock on its pad`);
  // Note: the free dock keeps the pad's pier side and that side is void.
  ok(dock && isl.rare.sites.airdock && dock.dir === isl.rare.sites.airdock.dir && pierDirs(isl, dock.x, dock.y, dock.size).includes(dock.dir), `${trait}: airdock dir ${dock && dock.dir} vs pad ${isl.rare.sites.airdock && isl.rare.sites.airdock.dir}`);
  rounds(w, isl, 8);
  const lb = E.live(isl, lm)[0];
  ok(!!lb && isl.landmark === lm, `${trait}: landmark ${lm} built (gap ${isl.placeGap})`);
  ok(lb && lb.x === isl.rare.sites.landmark.x && lb.y === isl.rare.sites.landmark.y, `${trait}: landmark on its pad`);
  ok(landmarksOf(isl).length === 1, `${trait}: one landmark`);
  ok((isl.want[good] || 0) === 1, `${trait}: wants exactly one ${good} (got ${isl.want[good]})`);
  const r = E.resourceAt(isl, dep.i, dep.j);
  ok(r && r.good === good && r.kind === 'dep', `${trait}: deposit gatherable`);
  const before = dep.n;
  const h = E.harvest(isl, dep.i, dep.j);
  ok(h && h.good === good && dep.n === before - 1, `${trait}: harvest takes one unit`);

  const def = CFG.BUILDINGS[lm];
  if (def.recipe) {
    const og = Object.keys(def.recipe.out)[0];
    ok(!((isl.want[og] || 0) > 0), `${trait}: no ${og} want before the Spire holds ${good}`);
    w.gw.paid[good] = 1;
    E.planIsland(w, isl);
    ok((isl.want[og] || 0) > 0, `${trait}: ${og} wanted once the Spire holds ${good}`);
    ok((isl.want[good] || 0) >= def.recipe.in[good], `${trait}: ${good} wanted for the recipe`);
  } else {
    w.gw.paid[good] = 1;
    E.planIsland(w, isl);
    ok(!((isl.want[good] || 0) > 0), `${trait}: ${good} not wanted once the Spire holds one`);
  }

  // Note: save round trip keeps landmark, key and deposit counts; a sleeper stays asleep.
  const json = JSON.parse(JSON.stringify(isl.toJSON()));
  const fresh = rareSample(trait);
  fresh.restore(json);
  ok(fresh.landmark === lm && fresh.relic === RI.relicKey(trait) && !fresh.dormant, `${trait}: restore landmark and key`);
  ok(fresh.rare.deposits.every((d, k) => d.n === isl.rare.deposits[k].n), `${trait}: restore deposit counts`);
  const sleeper = rareSample(trait);
  const s2 = rareSample(trait);
  s2.restore(JSON.parse(JSON.stringify(sleeper.toJSON())));
  ok(s2.dormant === true && RI.isDormant(s2), `${trait}: dormant survives restore`);
}

// Note: a pad taken during the dormant phase never costs the island its airdock.
for (const trait of RI.RARE_TRAITS) {
  const w = stubWorld(SEED);
  const isl = rareSample(trait);
  enter(w, isl, 4, 3);
  const pad = isl.rare.sites.airdock;
  const cx = pad.x + 1; const cy = pad.y + 1;
  // Attention: simulates a stair standing on the pad.
  E.startBuilding(w, isl, 'stairs', cx, cy, { dx: 1, dz: 0 });
  ok(E.awakenIsland(w, isl) === true, `${trait}: awaken with a blocked pad`);
  const dock = E.live(isl, 'airdock')[0];
  ok(dock && dock.built, `${trait}: airdock falls back to a free site`);
  ok(dock && pierDirs(isl, dock.x, dock.y, dock.size).includes(dock.dir), `${trait}: fallback dock has a valid pier dir`);
  ok(dock && dock.x === pad.x && dock.y === pad.y, `${trait}: the stair gives way and the dock stands on its pad`);
  ok(!E.live(isl, 'stairs').length, `${trait}: stair removed`);
}
// Note: a hut on the pad is not torn down; the dock takes a free site instead (when one exists).
{
  let fell = 0; let tried = 0;
  for (const trait of RI.RARE_TRAITS) {
    const w = stubWorld(SEED);
    const isl = rareSample(trait);
    enter(w, isl, 4, 3);
    const pad = isl.rare.sites.airdock;
    E.startBuilding(w, isl, 'hut', pad.x + 1, pad.y + 1, { built: true });
    E.awakenIsland(w, isl);
    tried++;
    const d = E.live(isl, 'airdock')[0];
    ok(E.live(isl, 'hut').length === 1, `${trait}: hut kept`);
    if (d) { fell++; ok(!(d.x === pad.x && d.y === pad.y), `${trait}: dock off the hut`); }
  }
  ok(fell >= tried - 2, `fallback airdock on ${fell} of ${tried} islands`);
}
// Note: ordinary islands: findSite airdock returns a rim site {x, y, dir, door} with a void pier side, and most islands have one.
{
  let have = 0; let tot = 0;
  for (let k = 0; k < 6; k++) for (const [gx, gz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) {
    const isl = generateIsland(900 + k * 7717, gx, gz);
    const r = E.findSite(null, isl, 'airdock', null);
    tot++;
    if (!r) continue;
    have++;
    ok(Number.isInteger(r.dir) && pierDirs(isl, r.x, r.y, 3).includes(r.dir) && r.door, `airdock site ${r.x},${r.y} dir ${r.dir} door ${!!r.door}`);
  }
  ok(have >= tot * 0.6, `ordinary islands with an airdock site: ${have}/${tot}`);
}
// Note: seeds loop: storehouse site, gatherable deposit, pad-free stairs and plants on every rare island.
for (let k = 0; k < 8; k++) {
  const seed = 17 + k * 211;
  for (const trait of [...RI.RARE_TRAITS, 'spire']) {
    const slot = RI.rareSlots(seed)[trait][0];
    const isl = generateIsland(seed, slot.gx, slot.gz);
    RI.rareTerrain(isl, trait);
    const w = stubWorld(seed);
    enter(w, isl, 4, 3);
    const L = `${trait} seed ${seed}`;
    ok(!!E.findSite(w, isl, 'storehouse', null), `${L}: storehouse site`);
    if (trait !== 'spire') {
      E.awakenIsland(w, isl);
      ok(E.live(isl, 'airdock').length === 1, `${L}: airdock`);
      ok(isl.rare.deposits.some((d) => E.resourceAt(isl, d.i, d.j)), `${L}: a gatherable deposit`);
    }
    if (!settle(w, isl)) continue;
    rounds(w, isl, 6);
    isl.reach = isl.reach || new Uint8Array(576).fill(1);
    const pc = E.padCells(isl);
    ok(pc && pc.size > 0, `${L}: pad cells`);
    for (let t = 0; t < 5; t++) {
      const sp = E.findPlantSpot(isl, 'tree', null, null);
      ok(!sp || !pc.has(sp[1] * 24 + sp[0]), `${L}: plant spot off the pads`);
    }
    const st = E.findStairSite(isl);
    ok(!st || !pc.has(st.y * 24 + st.x), `${L}: stair off the pads`);
    if (trait === 'spire') ok(E.live(isl, 'greatwork').length === 1 && E.live(isl, 'airdock').length === 1, `${L}: spire sites`);
  }
}

// Note: the Spire isle: Great Work site, free dock, foundation wants.
{
  const w = stubWorld(SEED);
  const isl = rareSample('spire');
  enter(w, isl, 3, 2);
  ok(isl.special === 'spire' && !RI.isDormant(isl), 'spire awake');
  settle(w, isl);
  E.planIsland(w, isl);
  const gwb = E.live(isl, 'greatwork')[0];
  ok(gwb && gwb.built && gwb.gw === true && gwb.x === isl.rare.sites.greatwork.x && gwb.y === isl.rare.sites.greatwork.y, 'spire: greatwork on its plinth');
  const dock = E.live(isl, 'airdock')[0];
  ok(dock && dock.built && dock.x === isl.rare.sites.airdock.x, 'spire: free airdock');
  for (const g of Object.keys(CFG.GW_FOUNDATION)) ok((isl.want[g] || 0) >= CFG.GW_FOUNDATION[g], `spire: wants foundation ${g}`);
  for (const g of CFG.RARE_GOODS) ok(!(isl.want[g] > 0), `spire: does not gather ${g}`);
  rounds(w, isl, 3);
  ok(E.live(isl, 'greatwork').length === 1 && E.live(isl, 'airdock').length === 1, 'spire: sites not duplicated');
  ok(E.landmarkFor(isl) === null && landmarksOf(isl).length === 0, 'spire: no landmark');
}

// Note: a string relic never breaks knowledge-relic paths; an object relic still counts.
{
  const w = stubWorld(SEED);
  const isl = rareSample('misty');
  RI.activate(isl, 'misty-key');
  ok(E.knowRelic(isl) === null, 'knowRelic null for a key string');
  ok(!!E.findSite(w, isl, 'storehouse', null), 'findSite works with a key string relic');
  const o = generateIsland(SEED, 1, 1);
  o.relic = { know: 'x', i: 1, j: 1, taken: false };
  ok(E.knowRelic(o) === o.relic && !E.isDormant(o), 'object relic is a knowledge relic');
}

// Note: deed memorial cells stay clear of new sites.
{
  const w = stubWorld(SEED);
  const isl = generateIsland(SEED, 1, 1);
  const first = E.findSite(w, isl, 'hut', null, { i: 12, j: 12 });
  ok(!!first, 'deed: a hut site');
  w.deeds = [{ kind: 'bridge', isl: isl.id, x: first.x, z: first.y, t: 1 }];
  for (let k = 0; k < 10; k++) {
    const s2 = E.findSite(w, isl, 'hut', null, { i: 12, j: 12 });
    ok(s2 && !(first.x >= s2.x - 0 && first.x < s2.x + 2 && first.y >= s2.y && first.y < s2.y + 2), 'deed: hut site avoids the memorial cell');
  }
}

console.log(`landmark check: ${checks} checks, ${failures} failures`);
if (failures) process.exit(1);
console.log('landmark checks ok');
