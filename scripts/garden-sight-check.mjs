// Note: node check for rare island sighting (sighting.js); run from the repo root with `node scripts/garden-sight-check.mjs [seeds]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const SG = await import('../public/garden/js/sighting.js');
const CO = await import('../public/garden/js/colony.js');
const { rareSlots, RARE_TRAITS } = await import('../public/garden/js/rareisles.js');

const seeds = Number(process.argv[2] || 3);
let failures = 0;
const fail = (m) => { failures++; if (failures <= 25) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

for (let n = 0; n < seeds; n++) {
  const seed = `SIGHT-${n}`;
  rs = 11 + n;
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  const rare = SG.rareIslands(w);
  ok(rare.length === RARE_TRAITS.length, `${seed}: ${rare.length} rare islands`);
  ok(rare.every((i) => !SG.isSighted(w, i) || i.revealed), `${seed}: a rare island starts sighted`);
  const unsighted = () => rare.filter((i) => !SG.isSighted(w, i));
  // Note: nothing sighted, so no party target; tier and navigation forced by hand.
  w.known.add('navigation'); w.recomputeUnlocked(); w.tierForce = 3;
  for (const i of rare) i.revealed = false;
  w.sighted.clear();

  // Charts: navigation known and nothing sighted names the rare island nearest home, once.
  SG.sightingTick(w);
  const home0 = w.islands.get('0,0');
  const chart = rare.slice().sort((p, q) => Math.hypot(p.wx - home0.wx, p.wz - home0.wz) - Math.hypot(q.wx - home0.wx, q.wz - home0.wz) || (p.id < q.id ? -1 : 1))[0];
  ok(unsighted().length === rare.length - 1 && SG.isSighted(w, chart), `${seed}: charts did not sight the nearest to home`);
  w.sighted.clear();

  // Tale: names the nearest one, then the next.
  const from = w.islands.get('0,0');
  const a = SG.sightByTale(w, from);
  ok(a && SG.isSighted(w, a), `${seed}: tale sighted nothing`);
  const near = rare.slice().sort((p, q) => Math.hypot(p.wx - from.wx, p.wz - from.wz) - Math.hypot(q.wx - from.wx, q.wz - from.wz) || (p.id < q.id ? -1 : 1))[0];
  ok(a === near, `${seed}: tale did not name the nearest (${a && a.id} vs ${near.id})`);
  ok(unsighted().length === rare.length - 1, `${seed}: tale sighted more than one`);

  // Hull: a hull in range sights, a far one does not.
  const B = unsighted()[0];
  w.ships = [{ id: 1, kind: 'cargo', state: 'cruise', pos: { x: B.wx + 200, y: 20, z: B.wz } }];
  SG.sightingTick(w);
  ok(!SG.isSighted(w, B), `${seed}: far hull sighted`);
  w.ships[0].pos = { x: B.wx + SG.SIGHT.hullRange - 1, y: 20, z: B.wz };
  SG.sightingTick(w);
  ok(SG.isSighted(w, B), `${seed}: near hull did not sight`);
  w.ships = [];

  // Lookout: a settled neighbour one ring away sights.
  const C = unsighted()[0];
  if (C) {
    const nb = w.getIsland(C.gx + (C.gx > 0 ? -1 : 1), C.gz);
    nb.revealed = true; nb.explored = true;
    SG.sightingTick(w);
    ok(SG.isSighted(w, C), `${seed}: lookout did not sight ${C.id} from ${nb.id}`);
  }

  // Gate: an unsighted island is no party target, a sighted one is.
  const D = unsighted()[0];
  if (D) {
    ok(!CO.partyTargetIds(w).includes(D.id), `${seed}: unsighted island is a party target`);
    SG.sight(w, D);
    ok(CO.partyTargetIds(w).includes(D.id) || !D.rare.sites || !D.rare.sites.airdock, `${seed}: sighted island is no party target`);
  }

  // Ambassador gift and save round trip.
  SG.sightAll(w);
  ok(unsighted().length === 0, `${seed}: sightAll left some`);
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
  ok(w2.sighted.size === w.sighted.size, `${seed}: sighted not saved (${w2.sighted.size} vs ${w.sighted.size})`);
}

console.log(failures ? `garden sight check: ${failures} failure(s)` : 'garden sight check: all ok');
process.exit(failures ? 1 : 0);
