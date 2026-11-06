// Note: node check for the council hall (the capital); run with `node scripts/garden-council-check.mjs [seeds]`.

// Note: the sim captures Math.random at import, so the seeded stream is installed before the dynamic imports; seedRandom resets it.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seedRandom = (s) => { rs = s >>> 0; };

const { World } = await import('../public/garden/js/world.js');
const { BUILDINGS, FLOURISH_IDS } = await import('../public/garden/js/config.js');
const { startBuilding, findSite, planIsland, live, isUnlocked, stockGet } = await import('../public/garden/js/econ.js');
const { islandScore, RUNG_SCORE } = await import('../public/garden/js/art.js');
const { KEEP } = await import('../public/garden/js/footprints.js');
const { hitRect } = await import('../public/garden/js/avoid.js');
const { tierSpot } = await import('../public/garden/js/spots.js');
const { cidx } = await import('../public/garden/js/island.js');
const { HOME_ID, COUNCIL_SCORE, homeIsland, councilBuilding, councilTier, councilTarget, councilFlourishTarget, tierAllows } = await import('../public/garden/js/capital.js');

const seeds = Number(process.argv[2] || 3);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

// Note: static contract: size, zero cost, flourish building, footprint table, score table.
ok(BUILDINGS.council && BUILDINGS.council.size === 2, 'council is a 2x2 building');
ok(Object.keys(BUILDINGS.council.cost).length === 0, 'T1 flagpost costs nothing');
ok(FLOURISH_IDS.has('council'), 'council is a flourish building');
ok(KEEP.council && KEEP.council.length === 5, 'council has a footprint per tier');
ok(HOME_ID === '0,0', 'capital is the island 0,0');
ok(COUNCIL_SCORE.length === 5 && COUNCIL_SCORE.every((v, k) => v === RUNG_SCORE[k]), 'COUNCIL_SCORE matches RUNG_SCORE');

const fresh = (seed, n) => {
  seedRandom(seed);
  const w = World.createNew(`SKY-CO${seed}`);
  for (let t = 0; t < n; t++) w.step(0.1);
  return w;
};

// Note: a fresh world with its planned council dropped, then a built one placed by hand.
const withCouncil = (seed) => {
  const c2 = fresh(seed, 0);
  const A2 = homeIsland(c2);
  for (const o of live(A2, 'council')) o.gone = true;
  return { c2, A2, cb: startBuilding(c2, A2, 'council', 2, 2, { built: true }) };
};

// Note: the spot cells of the placed council are walkable and reachable: findSite keeps its front row on solid ground.
function cb0(w, A, b, s) {
  for (const k of 'SCW') {
    const sp = tierSpot(A, b, k);
    const i = Math.floor(sp.x); const j = Math.floor(sp.z);
    ok(A.walkable(i, j) && (!A.reach || A.reach[cidx(i, j)]), `seed ${s}: council spot ${k} cell ${i},${j} is blocked or unreachable`);
  }
}

const sig = (w) => {
  const A = homeIsland(w);
  return live(A, 'council').map((b) => `${b.x},${b.y},${b.built ? 1 : 0},${b.flourish | 0},${b.tierMax | 0}`).join('|') + `#${councilTier(w)}#${A.rung}`;
};

for (let s = 0; s < seeds; s++) {
  const seed = 4100 + s * 31;
  const w = fresh(seed, 1800);
  const A = homeIsland(w);
  const sigA = sig(w);
  ok(A && A.id === HOME_ID, `seed ${s}: home island found`);
  ok(isUnlocked(w, 'council'), `seed ${s}: council is unlocked from the start`);

  // Note: folk build the free flagpost early; it exists on the home island only.
  let b = councilBuilding(w);
  ok(!!b, `seed ${s}: the planner placed a council by 3 min`);
  ok(live(A, 'council').length === 1, `seed ${s}: exactly one council on the home island`);
  for (const isl of w.islands.values()) if (isl !== A) ok(!live(isl, 'council').length, `seed ${s}: island ${isl.id} has no council`);
  if (b) ok(b.built, `seed ${s}: the flagpost stands by 3 min (progress ${b.progress.toFixed(2)})`);
  ok(stockGet(A, 'wood') >= 0 && stockGet(A, 'plank') >= 0, `seed ${s}: stock sane`);

  // Note: other islands never plan one, even when settled.
  const B = w.getIsland(1, 0);
  w.reveal(B, true);
  const sSite = findSite(w, B, 'storehouse', null, { i: 12, j: 12 });
  if (sSite) {
    startBuilding(w, B, 'storehouse', sSite.x, sSite.y, { built: true });
    let n = 0;
    for (const f of w.folk) if (n < 4) { f.isle = B.id; n++; }
    for (let k = 0; k < 6; k++) planIsland(w, B);
    ok(!live(B, 'council').length, `seed ${s}: a settled second island plans no council`);
    for (const f of w.folk) if (f.isle === B.id) f.isle = A.id;
  }

  if (!b || !b.built) continue;
  A.rung = 1; b.flourish = 0; b.tierMax = 0;
  ok(councilTier(w) === 1, `seed ${s}: built flagpost is T1`);
  ok(councilTarget(w) === 1 && councilFlourishTarget(w) === 0, `seed ${s}: rung 1 targets T1`);

  // Note: tier follows the rung while the flourish keeps up, and the flourish alone cannot pass the rung.
  for (let r = 1; r <= 5; r++) {
    const { c2, A2, cb } = withCouncil(seed);
    A2.rung = r; cb.flourish = r - 1;
    ok(councilTier(c2) === r, `seed ${s}: rung ${r} flourish ${r - 1} gives T${r}, got ${councilTier(c2)}`);
    ok(councilTarget(c2) === r, `seed ${s}: rung ${r} targets T${r}`);
  }
  {
    const { c2, A2, cb } = withCouncil(seed);
    A2.rung = 2; cb.flourish = 4;
    ok(councilTier(c2) === 2, `seed ${s}: flourish 4 at rung 2 is capped at T2`);
    A2.rung = 5; cb.flourish = 1;
    ok(councilTier(c2) === 2, `seed ${s}: flourish 1 at rung 5 is T2`);
  }

  // Note: the tier never drops: rung, score, flourish and a collapse do not lower it.
  {
    const { c2, A2, cb } = withCouncil(seed);
    A2.rung = 4; cb.flourish = 3;
    ok(councilTier(c2) === 4, `seed ${s}: T4 reached`);
    A2.rung = 1; A2.score = 0; A2.mood = 0;
    ok(councilTier(c2) === 4, `seed ${s}: T4 stays when the rung falls`);
    cb.flourish = 0;
    ok(councilTier(c2) === 4, `seed ${s}: T4 stays when the flourish falls`);
    for (const f of [...c2.folk]) if (f.isle === A2.id) f.isle = 'away';
    ok(councilTier(c2) === 4, `seed ${s}: T4 stays when the folk leave`);
    cb.gone = true;
    ok(councilBuilding(c2) === null && councilTier(c2) === 0, `seed ${s}: no council, no tier`);
    const nb = startBuilding(c2, A2, 'council', 4, 4, { built: true });
    ok(nb.flourish === undefined || nb.flourish === 0, `seed ${s}: rebuilt council starts at flourish 0`);
    ok(councilTier(c2) === 4, `seed ${s}: a rebuilt council keeps T4`);
    // Note: an unbuilt council gives no tier.
    nb.built = false;
    ok(councilTier(c2) === 0, `seed ${s}: unbuilt council gives T0`);
    nb.built = true;
    c2.tierForce = 5;
    ok(councilTier(c2) === 5, `seed ${s}: tierForce is a minimum`);
    c2.tierForce = 2;
    ok(councilTier(c2) === 4, `seed ${s}: tierForce never lowers`);
  }

  // Note: a collapse before any tier query still keeps the tier, through the ruin's flourish.
  {
    const { c2, A2, cb } = withCouncil(seed);
    A2.rung = 4; cb.flourish = 3;
    cb.gone = true;
    const nb = startBuilding(c2, A2, 'council', 4, 4, { built: true });
    ok(nb.flourish === undefined || nb.flourish === 0, `seed ${s}: rebuilt council starts low`);
    ok(councilTier(c2) === 4, `seed ${s}: a rebuilt council keeps T4 without an earlier query`);
  }

  // Note: spot jobs: the S, C and W stand points lie outside the council keep-out rect at every flourish; the live council's cells are checked apart.
  {
    const { c2, A2, cb } = withCouncil(seed);
    for (let fl = 0; fl <= 4; fl++) {
      cb.flourish = fl;
      for (const k of 'SCW') {
        const sp = tierSpot(A2, cb, k);
        const r = hitRect(A2, sp.x, sp.z, null);
        ok(!r || r.b !== cb, `seed ${s}: flourish ${fl} spot ${k} stands inside the council keep-out`);
      }
    }
  }
  {
    if (b) cb0(w, A, b, s);
  }

  // Note: orders by tier.
  {
    const c2 = fresh(seed, 0);
    const A2 = homeIsland(c2);
    const want = { link: 1, scout: 1, settle: 2, colony: 3, cargo: 4, rare: 4 };
    ok(Object.keys(want).every((o) => !tierAllows(c2, o)), `seed ${s}: no council allows no order`);
    ok(!tierAllows(c2, 'nonsense'), `seed ${s}: unknown order is refused`);
    const cb = startBuilding(c2, A2, 'council', 2, 2, { built: true });
    for (let t = 1; t <= 5; t++) {
      A2.rung = t; cb.flourish = t - 1;
      for (const o in want) ok(tierAllows(c2, o) === (t >= want[o]), `seed ${s}: T${t} ${o} -> ${tierAllows(c2, o)}`);
    }
    // Note: the council adds nothing to the island score.
    A2.rung = 1; cb.flourish = 0;
    const withC = islandScore(c2, A2);
    cb.gone = true;
    const without = islandScore(c2, A2);
    ok(Math.abs(withC - without) < 1e-9, `seed ${s}: islandScore ignores the council (${withC} vs ${without})`);
  }

  // Note: same seed, same council history.
  const w2 = fresh(seed, 1800);
  ok(sigA === sig(w2), `seed ${s}: deterministic (${sigA} vs ${sig(w2)})`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nall council checks passed');
process.exit(failures ? 1 : 0);
