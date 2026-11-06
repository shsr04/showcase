// Note: node check for rareisles.js: slots, dormancy, set-piece terrain, reach, sites, determinism.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-rareisle-check.mjs [seeds]
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const { generateIsland, cidx, ringOf } = await J('island.js');
const { N, MAX_H } = await J('config.js');
const R = await J('rareisles.js');
const { pierDirs } = await J('pier.js');

const seeds = Number(process.argv[2] || 60);
let failures = 0; let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) { failures++; if (failures < 40) console.error('FAIL:', m); } };

const TRAITS = R.RARE_TRAITS;
ok(TRAITS.length === 6, 'six rare traits');

// Note: slot rules over many seeds.
for (let s = 0; s < 200; s++) {
  const seed = 77 + s * 7919;
  const a = R.rareSlots(seed);
  const b = R.rareSlots(seed);
  ok(JSON.stringify(a) === JSON.stringify(b), `slots deterministic ${seed}`);
  const seen = new Set();
  for (const t of [...TRAITS, 'spire']) {
    const list = a[t];
    ok(Array.isArray(list) && list.length >= 1, `slot for ${t} seed ${seed}`);
    if (!list) continue;
    for (const e of list) {
      const key = `${e.gx},${e.gz}`;
      ok(!seen.has(key), `slot cell reused ${key} seed ${seed}`); seen.add(key);
      ok(ringOf(e.gx, e.gz) === e.ring, `ring field ${t} seed ${seed}`);
      if (t === 'spire') ok(e.ring === 3, `spire ring 3, got ${e.ring}`);
      else ok(e.ring >= 4 && e.ring <= 6, `${t} within ring 4-6 not rings 1-3, got ${e.ring} seed ${seed}`);
      ok(R.slotAt(seed, e.gx, e.gz) === t, `slotAt ${t}`);
    }
  }
  ok(R.slotAt(seed, 0, 0) === null, 'home is not a slot');
  // Note: two rare islands per ring 4, 5 and 6 in order of the rare table, the Spire on ring 3.
  const perRing = {}; for (const t of TRAITS) perRing[a[t][0].ring] = (perRing[a[t][0].ring] || 0) + 1;
  ok(JSON.stringify(perRing) === JSON.stringify({ 4: 2, 5: 2, 6: 2 }), `rare counts per ring ${JSON.stringify(perRing)} seed ${seed}`);
  ok(JSON.stringify(R.RARE_RINGS) === '[4,4,5,5,6,6]' && R.SPIRE_RING === 3 && R.LINK_MAX_RING === 4, 'ring constants');
  // Note: link goal distance counts the Spire and ring-4 rare slots only.
  for (const [gx, gz] of [[0, 0], [1, 2], [-3, 1], [4, 4]]) {
    const want = Math.min(...[...TRAITS, 'spire'].map((t) => a[t][0]).filter((e) => e.ring <= 4).map((e) => Math.max(Math.abs(e.gx - gx), Math.abs(e.gz - gz))));
    ok(R.goalDistLink(seed, gx, gz) === want, `goalDistLink ${gx},${gz} seed ${seed}`);
    ok(R.goalDistLink(seed, gx, gz) >= R.goalDist(seed, gx, gz), `goalDistLink >= goalDist seed ${seed}`);
  }
}
ok(JSON.stringify(R.rareSlots(1)) !== JSON.stringify(R.rareSlots(2)) || JSON.stringify(R.rareSlots(1)) !== JSON.stringify(R.rareSlots(3)), 'slots vary by seed');

const sample = (trait, seed) => {
  const slot = R.rareSlots(seed)[trait][0];
  const isl = generateIsland(seed, slot.gx, slot.gz);
  R.rareTerrain(isl, trait);
  return isl;
};

for (let s = 0; s < seeds; s++) {
  const seed = 31 + s * 101;
  for (const trait of [...TRAITS, 'spire']) {
    const L = `${trait} seed ${seed}`;
    const isl = sample(trait, seed);
    const probs = R.auditRare(isl);
    for (const p of probs) ok(false, `${L}: ${p}`);
    let top = 0; for (const v of isl.h) top = Math.max(top, v);
    ok(top <= MAX_H, `${L}: MAX_H`);
    ok(isl.landCount > 250, `${L}: land ${isl.landCount}`);
    const sp = trait === 'spire';
    ok(isl.rareSlot === (sp ? null : trait), `${L}: rareSlot`);
    ok(isl.special === (sp ? 'spire' : null), `${L}: special`);
    ok(R.isDormant(isl) === !sp, `${L}: dormant start`);
    ok(isl.dormant === !sp, `${L}: dormant flag`);
    ok(R.rareDeposits(isl).length === 0, `${L}: deposits inactive while dormant`);
    ok(sp || isl.rare.deposits.length >= 4, `${L}: deposits ${isl.rare.deposits.length}`);
    ok(sp ? isl.rare.sites.greatwork?.size === 4 : isl.rare.sites.landmark?.size === 3, `${L}: landmark size`);
    ok(isl.rare.sites.airdock?.size === 3, `${L}: airdock size`);
    // Note: the airdock block stands on the rim with a valid pier side and 9 land cells.
    {
      const ad = isl.rare.sites.airdock; const dirs = ad ? pierDirs(isl, ad.x, ad.y, ad.size) : [];
      ok(ad && Number.isInteger(ad.dir) && dirs.includes(ad.dir), `${L}: airdock dir ${ad && ad.dir} in pierDirs [${dirs}]`);
      let land = 0; if (ad) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (isl.mask[cidx(ad.x + i, ad.y + j)]) land++;
      ok(land === 9, `${L}: airdock block land ${land}`);
    }
    ok(isl.relic === null, `${L}: relic starts null`);
    ok(isl.paint && isl.paint.length === N * N, `${L}: paint`);
    // Note: wake the island and use the goods.
    if (!sp) {
      ok(R.activate(isl, R.relicKey(trait)) === true, `${L}: activate`);
      ok(typeof isl.relic === 'string' && !R.isDormant(isl) && isl.dormant === false, `${L}: awake after key`);
      const live = R.rareDeposits(isl);
      ok(live.length === isl.rare.deposits.length, `${L}: deposits live`);
      ok(live.every((d) => d.good === R.RARE_GOOD[trait]), `${L}: deposit good`);
      const d = live[0]; const before = d.n;
      ok(R.takeRare(isl, d) === R.RARE_GOOD[trait] && d.n === before - 1, `${L}: takeRare`);
      const st = R.rareState(isl);
      const again = sample(trait, seed); R.activate(again, 'k'); R.restoreRare(again, st);
      ok(JSON.stringify(R.rareState(again)) === JSON.stringify(st), `${L}: state roundtrip`);
      ok(!R.activate(isl, ''), `${L}: empty key refused`);
    } else ok(R.activate(isl, 'x') === false, `${L}: spire has no key`);
    // Note: determinism and idempotence.
    const twin = sample(trait, seed);
    ok(Buffer.compare(Buffer.from(twin.h.buffer), Buffer.from(sample(trait, seed).h.buffer)) === 0, `${L}: heights deterministic`);
    ok(Buffer.compare(Buffer.from(twin.paint), Buffer.from(sample(trait, seed).paint)) === 0, `${L}: paint deterministic`);
    // Note: per-trait set-piece content.
    const kinds = (k) => isl.rare.features.filter((f) => f.kind === k).length;
    const paintCount = (p) => { let n = 0; for (const v of isl.paint) if (v === p) n++; return n; };
    const wet = (() => { let n = 0; for (const v of isl.water) if (v > 0.05) n++; return n; })();
    if (trait === 'springs') { ok(kinds('pool') >= 4 && paintCount(R.PAINT.HOT) >= 30 && wet >= 30, `${L}: hot pools`); ok(isl.springs.length >= 2, `${L}: springs`); }
    if (trait === 'volcanic') { ok(kinds('cone') === 1 && paintCount(R.PAINT.OBSIDIAN) >= 25 && paintCount(R.PAINT.LAVA) >= 2, `${L}: cone and ridge`); ok(isl.geysers.length >= 1, `${L}: vents`); }
    if (trait === 'frozen') { ok(paintCount(R.PAINT.BED) >= 20, `${L}: beds`); let bad = 0; for (let c = 0; c < N * N; c++) if (isl.paint[c] === R.PAINT.BED && isl.snow[c] > 0) bad++; ok(bad === 0, `${L}: snow on beds`); ok(kinds('arch') >= 3, `${L}: arches`); }
    if (trait === 'arid') { ok(kinds('column') >= 6 && paintCount(R.PAINT.RUIN) >= 40, `${L}: ruins`); }
    if (trait === 'misty') { ok(wet >= 90 && kinds('pier') === 1 && paintCount(R.PAINT.PIER) >= 8, `${L}: sea and pier`); let dry = 0; for (let c = 0; c < N * N; c++) if (isl.paint[c] === R.PAINT.PIER && isl.water[c] <= 0.02) dry++; ok(dry >= 8, `${L}: pier dry`); }
    if (trait === 'crystal') ok(kinds('spire') >= 6, `${L}: spires`);
    if (sp) ok(kinds('plinth') === 1, `${L}: plinth`);
    let relief = 0; for (let v = 0; v < isl.h.length; v++) if (isl.h[v] > 0) relief = Math.max(relief, isl.h[v]);
    ok(trait === 'misty' ? relief >= 4 : sp || relief >= 5.5, `${L}: relief ${relief.toFixed(1)}`);
  }
}

console.log(`${checks} checks, ${failures} failures`);
if (failures) process.exit(1);
console.log('rare island checks ok');
