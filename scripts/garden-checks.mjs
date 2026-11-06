// Note: node checks for the Garden simulation; run with `node scripts/garden-checks.mjs [seeds] [minutes]`.

import { World } from '../public/garden/js/world.js';
import { N } from '../public/garden/js/config.js';
import { applyTool } from '../public/garden/js/sim.js';
import { cidx } from '../public/garden/js/island.js';
import { storehouse, live } from '../public/garden/js/econ.js';
import { computeAnchors } from '../public/garden/js/links.js';
import { CAPS } from '../public/garden/js/animals.js';
import { selfFed } from '../public/garden/js/ledger.js';

const seeds = Number(process.argv[2] || 6);
const minutes = Number(process.argv[3] || 45);
const verbose = process.argv[4] === 'v';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

function scriptedPlayer(w, t) {
  const home = w.getIsland(0, 0);
  const min = t / 600;
  if (Math.abs(min - 1) < 0.01) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (home.dep[cidx(i, j)] === 1) { for (let k = 0; k < 40; k++) applyTool(w, home, 'dig', i + 0.5, j + 0.5, 4.5, 0.3); return; }
  }
  if (min > 2 && min < 6 && t % 5 === 0) {
    // Note: water the soil at the nearest neighbour's anchor; folk plant the vines themselves.
    let best = null;
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = computeAnchors(home, w.getIsland(x, z)); if (a && (!best || a.gap < best.gap)) best = a; }
    if (best) {
      applyTool(w, home, 'water', best.ai.i + 0.5, best.ai.j + 0.5, 3, 0.3);
    }
  }
}

const results = [];
for (let s = 0; s < seeds; s++) {
  const seed = `SKY-${1000 + s}`;
  const w = World.createNew(seed);
  // Note: FORCE_KNOW=husbandry,weaving lets a short run exercise knowledge that relics would hide.
  if (process.env.FORCE_KNOW) { for (const k of process.env.FORCE_KNOW.split(',')) w.known.add(k); w.recomputeUnlocked(); }
  const t0 = performance.now();
  const evs = {};
  for (let t = 0; t < minutes * 600; t++) {
    scriptedPlayer(w, t);
    w.step(0.1);
    for (const e of w.events) evs[e.type] = (evs[e.type] || 0) + 1;
    if (t % 10 === 0) for (const f of w.folk) if (f.anim === 'slump' || f.anim === 'shrug') evs['anim_' + f.anim] = (evs['anim_' + f.anim] || 0) + 1;
    if (t % 10 === 0) for (const f of w.folk) if (f.task && f.task.type === 'gaze' && f.task.spot && f.task.phase === 'look' && (f.task.spot.why === 'goods' || f.task.spot.why === 'skill')) { const k = 'gaze_' + f.task.spot.why; evs[k] = (evs[k] || 0) + 1; }
    w.events.length = 0;
    if (verbose && t % 6000 === 0) console.log(`  t=${(t / 600).toFixed(0)}min folk=${w.folk.length} known=${[...w.known].length}`);
  }
  const isl = w.revealedIslands();
  const populated = isl.filter((i) => w.folkOn(i.id).length > 0).length;
  const madeOf = Object.keys(w.made).filter((g) => ['brick', 'ingot', 'bread', 'flour', 'plank', 'rope', 'charcoal', 'smoked', 'tool', 'cloth', 'lamp', 'gear'].includes(g));
  const linksDone = w.links.filter((l) => l.state === 'done').length;
  console.log(`${seed} home=${w.getIsland(0, 0).traits.join('+')} folk=${w.folk.length} islands=${isl.length} populated=${populated} links=${linksDone} known=${[...w.known].length} made=${madeOf.join(',')} ev=${JSON.stringify(evs)} ${(performance.now() - t0).toFixed(0)}ms`);
  const prog = isl.map((i) => `${i.rung}/${i.arch ? i.arch[0] : '-'}/${(i.score || 0).toFixed(0)}/${i.buildings.filter((b) => b && !b.gone && b.id === 'art').length}`).join(' ');
  const sig = isl.map((i) => `${i.buildings.filter((b) => b && !b.gone && b.id === 'bonfire' && b.built).length}${i.buildings.filter((b) => b && !b.gone && b.id === 'bonfire' && b.built && b.lit !== false).length}${i.buildings.filter((b) => b && !b.gone && b.id === 'pad' && b.built).length}`).join(' ');
  console.log(`  bonfire/lit/pad: ${sig}`);
  console.log(`  rung/arch/score/art: ${prog}`);
  // Note: flourishes are builder work, so none may exceed the island's rung target.
  let flourished = 0;
  for (const i of isl) for (const b of i.buildings) if (b && !b.gone && b.built) { flourished += b.flourish | 0; ok((b.flourish | 0) <= Math.max(0, i.rung - 1), `${seed} ${b.id} flourish ${b.flourish} > rung ${i.rung}`); }
  console.log(`  flourish steps: ${flourished}`);
  results.push({ known: w.known.size, populated, made: madeOf.length, links: linksDone, flourished });
  const an = { bird: 0, butterfly: 0, dog: 0, hen: 0, sheep: 0, fish: 0 };
  for (const a of w.animals) {
    an[a.kind]++;
    for (const k of ['x', 'z', 'alt', 'face']) ok(Number.isFinite(a[k]), `${seed} animal ${a.id} ${a.kind} ${k}`);
    if (a.kind === 'fish') { const isl = w.islands.get(a.isle); ok(isl.water[cidx(Math.floor(a.x), Math.floor(a.z))] >= 0.1 || a.state === 'jump', `${seed} fish ${a.id} out of water`); }
    if (a.kind === 'dog') { const isl = w.islands.get(a.isle); ok(isl.walkable(Math.floor(a.x), Math.floor(a.z)) || isl.land(Math.floor(a.x), Math.floor(a.z)), `${seed} dog ${a.id} off land`); }
  }
  for (const i of isl) {
    const bn = (id) => i.buildings.filter((b) => b && !b.gone && b.built && b.id === id).length;
    const caps = { bird: CAPS.bird, butterfly: CAPS.butterfly + 4 * bn('glassgarden'), dog: CAPS.dog, fish: CAPS.fish, hen: CAPS.hen * bn('coop'), sheep: CAPS.sheep * bn('pen') };
    for (const k of Object.keys(caps)) ok(w.animals.filter((a) => a.isle === i.id && a.kind === k).length <= caps[k], `${seed} cap ${k} on ${i.id}`);
  }
  for (const a of w.animals) if (a.kind === 'hen' || a.kind === 'sheep') ok(a.home && !a.home.gone && w.islands.get(a.isle).buildings.includes(a.home), `${seed} ${a.kind} ${a.id} home`);
  const bc = (id) => isl.reduce((n, i) => n + i.buildings.filter((b) => b && !b.gone && b.built && b.id === id).length, 0);
  console.log(`  animals: birds=${an.bird} butterflies=${an.butterfly} dogs=${an.dog} hens=${an.hen} sheep=${an.sheep} fish=${an.fish} fishers=${w.folk.filter((f) => f.fisher).length} caught=${w.made.fish || 0} coops=${bc('coop')} pens=${bc('pen')} glass=${bc('glassgarden')} eggs=${w.made.egg || 0} wool=${w.made.wool || 0} husbandry=${w.known.has('husbandry')} glasswork=${w.known.has('glasswork')}`);
  for (const f of w.folk) for (const k of ['x', 'z', 'age']) ok(Number.isFinite(f[k]), `${seed} folk ${f.id} ${k}`);
  // Note: family: couples are man + woman and mutual, islands hold at most 8, children name living or past parents.
  const byId = new Map(w.folk.map((f) => [f.id, f]));
  let couples = 0; let kids = 0; let girls = 0; let boys = 0;
  for (const f of w.folk) {
    ok(f.sex === 'm' || f.sex === 'f', `${seed} folk ${f.id} sex`);
    if (f.sex === 'f') girls++; else boys++;
    if (f.partner !== null && f.partner !== undefined) {
      const p = byId.get(f.partner);
      if (p && p.partner === f.id) { couples++; ok(p.sex !== f.sex, `${seed} couple ${f.id}/${p.id} same sex`); }
    }
    if (f.stage === 'child') kids++;
  }
  // Note: visiting traders and explorers are on the island only for a while, so they do not count against the cap.
  const resident = (f) => !(f.task && (f.task.type === 'trade' || (f.task.type === 'cross' && !f.task.settle)));
  for (const i of isl) ok(w.folkOn(i.id).filter(resident).length <= 8, `${seed} island ${i.id} over cap: ${w.folkOn(i.id).filter(resident).length} [${w.folkOn(i.id).map((f) => (f.task ? f.task.type : '-') + (f.stage === 'child' ? 'c' : '')).join(',')}]`);
  console.log(`  family: couples=${couples / 2} kids=${kids} m=${boys} f=${girls} emigrated=${evs.settled || 0}`);
  // Note: forced emigration: a long-homeless adult is queued over a finished link to an island with free beds.
  {
    let tested = false;
    for (const l of w.links) {
      if (l.state !== 'done' || tested) continue;
      for (const [aId, bId] of [[l.a, l.b], [l.b, l.a]]) {
        const A = w.islands.get(aId); const B = w.islands.get(bId);
        const f = w.folkOn(aId).find((q) => q.stage === 'adult' && !q.queue && !q.link && (!q.task || q.task.type === 'wander' || q.task.type === 'gaze'));
        if (tested || !A || !B || !f || live(A, 'hut').some((b) => !b.built)) continue;
        const cap = live(B, 'hut').filter((b) => b.built).reduce((n, b) => n + 2 + (b.level || 0), 0);
        // Note: an island that lives on shipments takes three folk at most.
        if (cap - w.folkOn(bId).filter((q) => q.home >= 0).length < 1 || w.folkOn(bId).length + w.inboundTo(bId) >= (selfFed(B) ? 8 : 3)) continue;
        f.home = -1; f.homelessT = 5000;
        w.emigrate(A, [f]);
        ok(f.queue && f.queue.type === 'cross' && f.queue.settle, `${seed} emigrate queues a settle`);
        f.queue = null; tested = true;
      }
    }
    console.log(`  emigration test: ${tested ? 'ok' : 'skipped (no free-bed neighbour)'}`);
  }
  const json = JSON.stringify(w.toJSON());
  const w2 = World.fromJSON(JSON.parse(json));
  ok(w2.folk.length === w.folk.length, `${seed} restore folk`);
  ok(w2.animals.length === w.animals.length, `${seed} restore animals`);
  ok(w2.folk.every((f, k) => f.sex === w.folk[k].sex && (f.partner ?? null) === (w.folk[k].partner ?? null)), `${seed} restore sex/partner`);
  for (let t = 0; t < 300; t++) w2.step(0.1);
}
const avg = (k) => results.reduce((a, r) => a + r[k], 0) / results.length;
console.log(`avg known=${avg('known').toFixed(1)} populated=${avg('populated').toFixed(1)} madeKinds=${avg('made').toFixed(1)} links=${avg('links').toFixed(1)}`);
ok(avg('known') >= 4, 'knowledge grows');
ok(avg('populated') >= 2, 'second island populated');
ok(avg('made') >= 2, 'crafted goods made');
ok(avg('flourished') >= 1, 'builders add flourishes');
console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
