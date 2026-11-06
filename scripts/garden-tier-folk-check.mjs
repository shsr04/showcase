// Note: node check for folk idle jobs at tier props; run with `node scripts/garden-tier-folk-check.mjs [seeds] [days]`.

import { World } from '../public/garden/js/world.js';
import { TIER_JOBS, FLOURISH_IDS } from '../public/garden/js/config.js';
import { startBuilding, findSite } from '../public/garden/js/econ.js';
import { cidx } from '../public/garden/js/island.js';
import { tierSpot, buildingYaw } from '../public/garden/js/spots.js';

const seeds = Number(process.argv[2] || 3);
const days = Number(process.argv[3] || 4);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

// Note: seeded random so a failure can be replayed.
function seedRandom(s) {
  let a = s >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const JOB_TYPES = new Set(Object.values(TIER_JOBS).map((j) => j.type));
const total = { tidy: 0, sit: 0, water: 0 };
let sabGo = 0; let sabWalk = 0;

for (let s = 0; s < seeds; s++) {
  // Note: flat sites are random per run, so retry fresh worlds until three huts fit.
  let w; let A; let huts = [];
  for (let attempt = 0; attempt < 8 && huts.length < 3; attempt++) {
    seedRandom(1234 + s * 77 + attempt * 5);
    w = World.createNew(`SKY-TF${s}${attempt || ''}`);
    for (let t = 0; t < 1800; t++) w.step(0.1);
    A = w.getIsland(0, 0);
    w.planNow(A);
    huts = [];
    for (const fl of [2, 3, 4]) {
      const site = findSite(w, A, 'hut', A.reach, null);
      if (!site) break;
      const b = startBuilding(w, A, 'hut', site.x, site.y, { built: true });
      b.flourish = fl;
      huts.push(b);
    }
    // Note: keep only worlds where every prop slot is on a reachable cell after the huts stand.
    w.planNow(A);
    if (huts.some((b) => 'SCW'.split('').some((k) => { const sp = tierSpot(A, b, k); const i = Math.floor(sp.x); const j = Math.floor(sp.z); return !A.walkable(i, j) || !A.reach[cidx(i, j)]; }))) huts = [];
  }
  ok(huts.length >= 3, `seed ${s}: placed ${huts.length} huts`);
  // Note: the spot helper must agree with the door: the stand point lies on the door side of the building.
  for (const b of huts) {
    const sp = tierSpot(A, b, 'W');
    const cx = b.x + b.size / 2; const cz = b.y + b.size / 2;
    const yaw = buildingYaw(A, b);
    ok(Math.abs((sp.x - cx) * Math.sin(yaw) + (sp.z - cz) * Math.cos(yaw) - (b.size / 2 + 0.5)) < 1e-6, `seed ${s}: W spot is half+0.5 along the door side`);
  }
  for (const f of w.folk) for (const k in f.needs) f.needs[k] = Math.min(f.needs[k], 0.5);

  const rec = new Map(); const started = new Map();
  const seen = { tidy: 0, sit: 0, water: 0 };
  let lastPhase = -1; let sabbed = null; let restored = false; let savedMid = false;
  for (let t = 0; t < days * 3600; t++) {
    w.step(0.1);
    // Note: nudge needs once per day at the start of dusk and of morning, so the short windows see demand.
    const phase = Math.floor(w.tod * 100);
    if (phase !== lastPhase) { lastPhase = phase; if (phase === 64 || phase === 35) for (const f of w.folk.filter((q) => !q.task || !q.task.jobKind)) f.needs.company = Math.min(f.needs.company, 0.45), f.needs.shelter = Math.min(f.needs.shelter, 0.5), f.needs.wonder = Math.min(f.needs.wonder, 0.5); }
    for (const f of w.folk) {
      const tk = f.task;
      if (tk && tk.jobKind) {
        if (!started.has(f.id) || started.get(f.id).task !== tk) started.set(f.id, { task: tk, t0: w.time });
        ok(w.time - started.get(f.id).t0 < 60, `seed ${s}: ${tk.type} lasts over 60 s (phase ${tk.phase})`);
        ok(TIER_JOBS[tk.jobKind].type === tk.type, 'task type matches slot');
        ok(tk.b.spotBusy && tk.b.spotBusy[tk.jobKind] === f.id, `seed ${s}: ${tk.type} holds its spot`);
        ok((tk.b.flourish | 0) >= TIER_JOBS[tk.jobKind].min, `seed ${s}: ${tk.type} needs flourish ${TIER_JOBS[tk.jobKind].min}`);
        if (tk.phase === 'do' && !rec.has(f.id)) {
          const J = TIER_JOBS[tk.jobKind];
          rec.set(f.id, { before: f.needs[J.need], rest: f.needs.rest, task: tk, t0: w.time, night: w.night });
          ok(J.when === 'day' ? w.night <= 0.3 : (w.tod > 0.5 && w.night < 0.9), `seed ${s}: ${tk.type} at the wrong time (night ${w.night.toFixed(2)})`);
          if (!savedMid && tk.type === 'sit') {
            // Note: a save mid-session drops the task and carries no spotBusy.
            savedMid = true;
            const json = JSON.stringify(w.toJSON());
            ok(!json.includes('spotBusy'), 'spotBusy is not saved');
            const w2 = World.fromJSON(JSON.parse(json));
            ok(w2.folk.every((q) => !q.task), 'restored folk have no task');
            for (let k = 0; k < 1500; k++) w2.step(0.1);
            ok(w2.islands.get(A.id).buildings.every((q) => !q || !q.spotBusy || Object.values(q.spotBusy).every((v) => v === null || w2.folk.some((o) => o.id === v && o.task && o.task.b === q))), 'restored world has no stale spot claims');
          }
        }
        // Note: sabotage once at 'go' and once while walking; the folk must give up cleanly.
        if (!sabbed && tk.phase === 'go' && sabGo <= sabWalk && sabGo < 1 + s) sabbed = { f, tk, where: 'go' };
        else if (!sabbed && tk.phase === 'walk' && sabWalk < sabGo) sabbed = { f, tk, where: 'walk' };
        if (sabbed && sabbed.tk === tk && !sabbed.c) {
          const sp = tierSpot(A, tk.b, tk.jobKind);
          const c = cidx(Math.floor(sp.x), Math.floor(sp.z));
          sabbed.c = c; sabbed.old = A.bld[c]; sabbed.t0 = w.time;
          A.bld[c] = A.buildings.indexOf(tk.b);
        }
      }
      if (!tk && rec.has(f.id)) {
        const r = rec.get(f.id); rec.delete(f.id);
        const J = TIER_JOBS[r.task.jobKind];
        // Note: an unfinished session (cut by dusk or night) may refill less; finished ones raise the need by gain.
        if (r.task.t <= 0) ok(f.needs[J.need] - r.before >= J.gain * 0.7 || f.needs[J.need] >= 0.97, `seed ${s}: ${J.type} refilled ${r.before.toFixed(2)} -> ${f.needs[J.need].toFixed(2)} after ${(w.time - r.t0).toFixed(1)} s, night ${r.night.toFixed(2)}, anim ${f.anim}, dur ${J.dur}`);
      }
    }
    if (sabbed && sabbed.c !== undefined && !restored) {
      const f = sabbed.f;
      if (f.task !== sabbed.tk) {
        A.bld[sabbed.c] = sabbed.old; restored = true;
        ok(!(sabbed.tk.b.spotBusy && sabbed.tk.b.spotBusy[sabbed.tk.jobKind] === f.id), `seed ${s}: spot released after ${sabbed.where} failure`);
        if (sabbed.where === 'go') sabGo++; else sabWalk++;
      } else if (w.time - sabbed.t0 > 45) { A.bld[sabbed.c] = sabbed.old; restored = true; ok(false, `seed ${s}: folk stuck after ${sabbed.where} sabotage`); }
      if (restored) sabbed = null;
    }
    if (restored) restored = false;
    for (const b of A.buildings) {
      if (!b || !b.spotBusy) continue;
      for (const k in b.spotBusy) {
        const id = b.spotBusy[k];
        if (id === null || id === undefined) continue;
        const h = w.folk.find((o) => o.id === id);
        ok(h && h.task && h.task.b === b && h.task.jobKind === k, `seed ${s}: stale claim ${k} by ${id}`);
      }
    }
    for (const e of w.events) if (e.type === 'tierjob') { seen[{ S: 'tidy', C: 'sit', W: 'water' }[e.kind]]++; ok(FLOURISH_IDS.has(e.b.id), 'tier job on a flourish building'); ok(e.b.flourish >= TIER_JOBS[e.kind].min, 'tier job min flourish'); }
    w.events.length = 0;
  }
  for (const k in seen) total[k] += seen[k];
  const t4 = huts.find((b) => b.flourish === 4); const t2 = huts.find((b) => b.flourish === 2);
  console.log(`seed ${s}: sessions ${JSON.stringify(seen)} folk=${w.folk.length} mood=${(w.folk.reduce((a, f) => a + f.mood, 0) / Math.max(1, w.folk.length)).toFixed(2)} t2/t4 ${!!t2}/${!!t4}`);
  if (!seen.sit || !seen.water) console.log('  no sit/water:', huts.map((b) => `fl=${b.flourish} ${'SCW'.split('').map((k) => { const sp = tierSpot(A, b, k); const i = Math.floor(sp.x); const j = Math.floor(sp.z); return `${k}:${A.walkable(i, j) ? 'w' : '-'}${A.reach[cidx(i, j)] ? 'r' : '-'}`; }).join(',')} claims=${b.claims} gone=${b.gone}`).join(' / '));
  ok(!w.folk.some((f) => f.task && f.task.jobKind && !f.task.b), 'no orphan job');
  // Note: after the run, drop all tasks; no spot may stay claimed.
  for (const f of w.folk) if (f.task && f.task.jobKind) { f.task = null; }
}
ok(total.tidy > 0, 'tidy sessions happened');
ok(total.sit > 0, 'sit sessions happened');
ok(total.water > 0, 'water sessions happened');
ok(sabGo + sabWalk > 0, 'failure paths were exercised');
console.log(`total ${JSON.stringify(total)} sabotage go/walk ${sabGo}/${sabWalk}`);
console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
