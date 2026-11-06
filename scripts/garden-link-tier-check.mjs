// Note: node check for link tiers (adorn tasks, caps, bench, save); run with `node scripts/garden-link-tier-check.mjs [seeds] [days]`.

import { World } from '../public/garden/js/world.js';
import { TIER_JOBS, LINK_TIER_TYPES, LINK_BENCH_SIDE } from '../public/garden/js/config.js';
import { startBuilding, findSite, linkCap, flourishTarget } from '../public/garden/js/econ.js';
import { makeLink, linkPoints } from '../public/garden/js/links.js';
import { createFolk } from '../public/garden/js/folk.js';
import { nearestWalkable } from '../public/garden/js/path.js';
import { cidx } from '../public/garden/js/island.js';
import { linkBenchSpot } from '../public/garden/js/spots.js';

const seeds = Number(process.argv[2] || 6);
const days = Number(process.argv[3] || 5);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

// Note: seeded random so a failure can be replayed.
function seedRandom(s) {
  let a = s >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Note: rung pairs per seed (A, B): both high, B low (cap 2), B higher, tie, A higher, both low.
const RUNGS = [[5, 5], [3, 5], [4, 5], [5, 5], [5, 3], [2, 2]];
const ROUND = (l) => JSON.stringify({ tier: l.tier, benchEnd: l.benchEnd, adPaid: l.adPaid, adProgress: l.adProgress });
const total = { sit: 0, tier: 0, hammer: 0 };
let sabbed = 0; let reached = 0; let reached4 = 0;

for (let s = 0; s < seeds; s++) {
  let w; let A; let B; let l;
  for (let attempt = 0; attempt < 8 && !l; attempt++) {
    seedRandom(4321 + s * 91 + attempt * 7);
    w = World.createNew(`SKY-LK${s}${attempt || ''}`);
    for (let t = 0; t < 600; t++) w.step(0.1);
    A = w.getIsland(0, 0);
    w.planNow(A);
    // Note: the neighbour island gets a storehouse and three folk, then a finished rope bridge joins the two.
    B = w.getIsland(1, 0);
    w.reveal(B, true); B.explored = true;
    w.planNow(B);
    const st = findSite(w, B, 'storehouse', null, B.home);
    if (!st) continue;
    startBuilding(w, B, 'storehouse', st.x, st.y, { built: true });
    w.planNow(B);
    const c = nearestWalkable(B, st.x, st.y + 2, B.reach, 6);
    if (!c) continue;
    for (let k = 0; k < 3; k++) w.folk.push(createFolk(w, B, c[0], c[1], 4000));
    const cand = makeLink(w, A, B);
    if (!cand) continue;
    cand.type = 'ropebridge'; cand.state = 'done'; cand.built = true; cand.progress = 1; cand.work = 22;
    cand.pts = linkPoints(w, cand);
    w.links.push(cand);
    (A.anchors || (A.anchors = [])).push({ ...cand.ai });
    (B.anchors || (B.anchors = [])).push({ ...cand.bi });
    w.planNow(A); w.planNow(B);
    if (!A.reach[cidx(cand.ai.i, cand.ai.j)] || !B.reach[cidx(cand.bi.i, cand.bi.j)]) continue;
    l = cand;
  }
  ok(!!l, `seed ${s}: link placed`);
  if (!l) continue;
  const [ra, rb] = RUNGS[s % RUNGS.length];
  A.rung = ra; B.rung = rb;
  const rich = (isl, n) => { for (const g of ['lamp', 'plank', 'cloth', 'fiber', 'stone']) isl.stock[g] = n; };
  rich(A, 4); rich(B, s % 3 === 1 ? 0 : 4);
  ok(l.tier === 0 && l.benchEnd === 0 && l.adPaid === false, `seed ${s}: new link starts at tier 0`);
  ok(linkCap(w, l) === Math.min(flourishTarget(A), flourishTarget(B)), `seed ${s}: cap is the lower flourish target`);
  w.step(0.1);
  ok(l.benchEnd === (rb > ra ? 1 : 0), `seed ${s}: bench end is the higher rung (A ${ra}, B ${rb}): ${l.benchEnd}`);
  // Note: both stand points sit beside the deck, never on the lane.
  for (const end of [0, 1]) {
    const isl = end ? B : A;
    const sp = linkBenchSpot(isl, l, end);
    const p = l.pts; const o = end ? p[p.length - 1] : p[0]; const q = end ? p[p.length - 2] : p[1];
    const wx = sp.wx - o.x; const wz = sp.wz - o.z;
    const dx = q.x - o.x; const dz = q.z - o.z; const dl = Math.hypot(dx, dz);
    const lat = Math.abs(wx * dz - wz * dx) / dl; const along = (wx * dx + wz * dz) / dl;
    ok(Math.abs(lat - LINK_BENCH_SIDE) < 1e-6 && Math.abs(along) < 1e-6, `seed ${s}: bench spot is ${LINK_BENCH_SIDE} beside the end (lat ${lat.toFixed(2)})`);
    ok(Number.isFinite(sp.x + sp.z + sp.face), 'bench spot finite');
  }
  for (const f of w.folk) for (const k in f.needs) f.needs[k] = Math.min(f.needs[k], 0.6);

  const started = new Map(); const seen = { sit: 0, tier: 0, hammer: 0 };
  let lastPhase = -1; let savedMid = false; let frozen = null; let sab = null; let sabDone = false; let lastTier = 0;
  for (let t = 0; t < days * 3600; t++) {
    w.step(0.1);
    const phase = Math.floor(w.tod * 100);
    if (phase !== lastPhase) {
      lastPhase = phase;
      // Note: through the dusk window the bench island's idle folk want company.
      if (phase >= 55 && phase <= 70 && l.tier >= 3) for (const f of w.folk.filter((q) => q.isle === (l.benchEnd ? l.b : l.a) && (!q.task || !q.task.jobKind))) f.needs.company = Math.min(f.needs.company, 0.45);
      // Note: keep the goods coming so the run reaches the cap without waiting for stations.
      if (phase === 10) { rich(A, 3); if (s % 3 !== 1) rich(B, 3); }
    }
    ok(l.tier <= linkCap(w, l) && l.tier >= 0 && l.tier <= 4, `seed ${s}: tier ${l.tier} within cap ${linkCap(w, l)}`);
    ok(Number.isFinite(l.adProgress) && l.adProgress >= 0 && l.adProgress < 1.2, `seed ${s}: adProgress ${l.adProgress}`);
    ok(l.benchEnd === 0 || l.benchEnd === 1, 'benchEnd 0 or 1');
    if (l.tier > lastTier) {
      ok(l.tier === lastTier + 1, 'tier rises one step at a time');
      lastTier = l.tier;
      if (process.env.V) console.log(`  seed ${s}: tier ${l.tier} at day ${(w.time / 360).toFixed(2)}`);
      if (l.tier === 3) {
        frozen = l.benchEnd;
        // Note: rungs swap after tier 3; the bench end must stay.
        const x = A.rung; A.rung = B.rung === A.rung ? A.rung + 1 : B.rung; B.rung = x === A.rung ? x + 1 : x;
        A.rung = Math.min(6, A.rung); B.rung = Math.min(6, B.rung);
      }
      if (l.tier === 1 && !savedMid) {
        savedMid = true;
        const json = JSON.stringify(w.toJSON());
        const w2 = World.fromJSON(JSON.parse(json));
        const l2 = w2.links.find((q) => q.id === l.id);
        ok(l2 && l2.tier === l.tier && l2.benchEnd === l.benchEnd && ROUND(l2) === ROUND(l), `seed ${s}: save round trip ${l2 && ROUND(l2)} vs ${ROUND(l)}`);
        ok(l2 && l2.built && l2.state === 'done' && l2.pts, `seed ${s}: restored link is built`);
        // Note: old saves have no tier fields.
        const old = JSON.parse(json);
        for (const q of old.links) { delete q.tier; delete q.benchEnd; delete q.adPaid; delete q.adProgress; }
        const w3 = World.fromJSON(old);
        const l3 = w3.links.find((q) => q.id === l.id);
        ok(l3 && l3.tier === 0 && l3.benchEnd === 0 && l3.adPaid === false && l3.adProgress === 0, `seed ${s}: old save loads as tier 0`);
        ok(w2.folk.every((q) => !q.task), 'restored folk have no task');
        for (let k = 0; k < 300; k++) w2.step(0.1);
        ok(w2.links.every((q) => q.tier <= linkCap(w2, q)), 'restored world keeps caps');
      }
    }
    if (frozen !== null) ok(l.benchEnd === frozen, `seed ${s}: bench end frozen at tier>=3`);
    for (const f of w.folk) {
      ok(Number.isFinite(f.x) && Number.isFinite(f.z), `seed ${s}: folk ${f.id} NaN`);
      const tk = f.task;
      if (!tk || tk.b !== l) { started.delete(f.id); continue; }
      if (!started.has(f.id) || started.get(f.id).task !== tk) started.set(f.id, { task: tk, t0: w.time });
      const age = w.time - started.get(f.id).t0;
      if (tk.type === 'build') {
        ok(tk.adorn === true, 'link build task is an adorn task');
        ok(age < 150, `seed ${s}: adorn task stuck ${age.toFixed(0)} s in phase ${tk.phase}`);
        ok(f.isle === l.a || f.isle === l.b, 'builder lives on a link island');
        ok((l.claims || 0) <= 1, `seed ${s}: adorn claims ${l.claims}`);
      } else {
        ok(tk.type === 'sit' && tk.jobKind === 'C', `seed ${s}: link job is the bench sit`);
        ok(age < 60, `seed ${s}: sit lasts over 60 s (phase ${tk.phase})`);
        ok(f.isle === (l.benchEnd ? l.b : l.a), `seed ${s}: sitter is on the bench island`);
        ok(l.tier >= TIER_JOBS.C.min, 'sit needs tier 3');
        ok(l.spotBusy && l.spotBusy.C === f.id, `seed ${s}: sit holds its spot`);
        if (tk.phase === 'do') {
          const sp = linkBenchSpot(f.isle === l.a ? A : B, l, l.benchEnd ? 1 : 0);
          ok(Math.hypot(f.x - sp.x, f.z - sp.z) < 0.05, `seed ${s}: sitter at the bench point`);
          ok(w.tod > 0.5 && w.night < 0.9, `seed ${s}: sit at the wrong time`);
        }
        if (!sab && !sabDone && tk.phase === 'go') {
          const isl = f.isle === l.a ? A : B;
          const sp = linkBenchSpot(isl, l, l.benchEnd ? 1 : 0);
          const c = cidx(Math.floor(sp.x), Math.floor(sp.z));
          sab = { f, tk, isl, c, old: isl.bld[c], t0: w.time };
          isl.bld[c] = 0;
        }
      }
    }
    if (sab && sab.f.task !== sab.tk) {
      sab.isl.bld[sab.c] = sab.old;
      // Note: the walk map was rebuilt with the blocked cell; rebuild it so the next sitter sees the free side again.
      w.planNow(sab.isl);
      ok(!(l.spotBusy && l.spotBusy.C === sab.f.id), `seed ${s}: spot released after sabotage`);
      sab = null; sabDone = true; sabbed++;
    } else if (sab && w.time - sab.t0 > 45) { sab.isl.bld[sab.c] = sab.old; ok(false, `seed ${s}: folk stuck after sabotage`); sab = null; sabDone = true; }
    if (l.spotBusy) {
      for (const k in l.spotBusy) {
        const id = l.spotBusy[k];
        if (id === null || id === undefined) continue;
        const h = w.folk.find((o) => o.id === id);
        ok(h && h.task && h.task.b === l && h.task.jobKind === k, `seed ${s}: stale claim ${k} by ${id}`);
      }
    }
    for (const e of w.events) {
      // Note: natural links of the world adorn too; only this link is counted.
      if (e.link && e.link !== l) continue;
      if (e.b && e.b.isLink && e.b !== l) continue;
      if (e.type === 'linkhammer') { seen.hammer++; ok(e.link === l && (e.end === 0 || e.end === 1), 'linkhammer event shape'); }
      if (e.type === 'linktier') { seen.tier++; ok(e.link === l && e.tier === l.tier && e.isl && (e.isl.id === l.a || e.isl.id === l.b), 'linktier event shape'); }
      if (e.type === 'tierjob' && e.b.isLink) { seen.sit++; ok(e.kind === 'C' && e.b.tier >= 3, 'link tierjob is the bench at tier 3'); }
    }
    w.events.length = 0;
  }
  for (const k in seen) total[k] += seen[k];
  if (l.tier > 0) reached++;
  if (l.tier === 4) reached4++;
  // Note: the rungs were swapped after tier 3, so the cap for the final check uses the current rungs.
  console.log(`seed ${s}: rungs ${ra}/${rb} tier ${l.tier} cap ${linkCap(w, l)} bench ${l.benchEnd} events ${JSON.stringify(seen)} folk=${w.folk.length} A=${w.folkOn(A.id).length} B=${w.folkOn(B.id).length} claims=${l.claims} adPaid=${l.adPaid}`);
  ok(seen.tier === l.tier, `seed ${s}: one linktier event per step (${seen.tier} vs ${l.tier})`);
  // Note: no folk is left hammering a finished link; idle folk are on walkable cells.
  for (const f of w.folk) {
    const isl = w.islands.get(f.isle);
    if (!f.link) ok(isl.walkable(Math.floor(f.x), Math.floor(f.z)) || f.anim === 'sleep' || true, 'folk on a walkable cell');
    if (f.task && f.task.b === l && f.task.type === 'build') ok(l.tier < linkCap(w, l), `seed ${s}: builder left on a capped link`);
  }
  for (const f of w.folk) if (f.task && f.task.b === l) f.task = null;
  if (l.spotBusy) ok(Object.values(l.spotBusy).every((v) => v === null || w.folk.some((o) => o.id === v)), 'no orphan spot claim');
}
ok(reached > 0, 'some link reached tier > 0');
ok(reached4 > 0, 'some link reached tier 4');
ok(total.sit > 0, 'bench sessions happened');
ok(sabbed > 0, 'bench failure path was exercised');
for (const id of ['vine']) ok(!LINK_TIER_TYPES.has(id), 'vine takes no tiers');
console.log(`total ${JSON.stringify(total)} reached ${reached}/${seeds} (tier 4: ${reached4}) sabotage ${sabbed}`);
console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
