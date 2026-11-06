// Note: node check that nothing grounded overlaps; run with `node scripts/garden-overlap-check.mjs [seeds] [minutes] [--strict] [--max-pair=N]`.
// Note: scenarios per seed: base (folk), husbandry (hens, sheep, dog, herds and two-way bridge traffic), fires (forced fires and new buildings on folk).

import { World } from '../public/garden/js/world.js';
import { N } from '../public/garden/js/config.js';
import { cidx } from '../public/garden/js/island.js';
import { startBuilding, findSite } from '../public/garden/js/econ.js';
import { makeLink, linkPoints, linkPos } from '../public/garden/js/links.js';
import { endTask } from '../public/garden/js/folk.js';
import { RAD, radOf, overlapDist, passable, hitRect, AV } from '../public/garden/js/avoid.js';

const seeds = Number(process.argv[2] || 3);
const minutes = Number(process.argv[3] || 12);
const STRICT = process.argv.includes('--strict');
const maxPair = Number((process.argv.find((a) => a.startsWith('--max-pair=')) || '--max-pair=0').split('=')[1]);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

function seedRandom(s) {
  let a = s >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const stat = { stuck: {}, pair: {}, kinds: {}, bld: {}, fire: {}, samples: 0, movers: 0 };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const examples = {};
const note = (k, s) => { if (!examples[k]) examples[k] = s; };
const walkableLink = (l) => l.state === 'done' && l.pts && (l.type === 'vine' || l.type === 'ropebridge');

// Note: world position of a mover on the ground or on a walkable link.
function worldPos(w, o) {
  if (o.link) {
    if (!walkableLink(o.link.l)) return null;
    const p = linkPos(o.link.l, o.link.t, o.link.rev);
    return { x: p.x, z: p.z, link: true };
  }
  const isl = w.islands.get(o.isle);
  return isl ? { x: isl.wx + o.x - N / 2, z: isl.wz + o.z - N / 2, link: false } : null;
}

// Note: a livelock episode is a folk with a path in hand that stays within 0.4 cells for 6 s.
const anchors = new Map();
function stuckSample(w, tag) {
  // Note: a livestock animal that wants to walk but stays within 0.15 cells for 6 s is stuck.
  for (const a of w.animals) {
    if (a.kind !== 'sheep' && a.kind !== 'hen') continue;
    const key = 'a' + a.id;
    if (a.hidden) { stat.henIn = (stat.henIn || 0) + 1; anchors.delete(key); continue; }
    if (a.kind === 'hen') stat.henOut = (stat.henOut || 0) + 1;
    if (a.state !== 'walk') { anchors.delete(key); continue; }
    const q = anchors.get(key);
    if (!q || Math.hypot(a.x - q.x, a.z - q.z) > 0.15) { anchors.set(key, { x: a.x, z: a.z, t: w.time }); continue; }
    if (w.time - q.t > 6) {
      bump(stat.stuck, `${a.kind} stuck`);
      if (process.argv.includes('--dbg')) console.log('ASTUCK', tag, w.time | 0, JSON.stringify({ kind: a.kind, x: +a.x.toFixed(2), z: +a.z.toFixed(2), tx: +a.tx?.toFixed(2), tz: +a.tz?.toFixed(2), home: a.home && [a.home.x, a.home.y, a.home.size] }));
      anchors.set(key, { x: a.x, z: a.z, t: w.time });
    }
  }
  for (const f of w.folk) {
    const walking = !f.link && !f.blocked && f.path && f.pi < f.path.length && f.task && f.anim !== 'sleep';
    if (!walking) { anchors.delete(f.id); continue; }
    const a = anchors.get(f.id);
    if (!a || a.isle !== f.isle || Math.hypot(f.x - a.x, f.z - a.z) > 0.4) { anchors.set(f.id, { x: f.x, z: f.z, t: w.time, isle: f.isle }); continue; }
    if (w.time - a.t > 6) {
      if (process.argv.includes('--dbg')) { const isl = w.islands.get(f.isle); const [ci, cj] = f.path[f.pi]; console.log('STUCK', tag, w.time | 0, JSON.stringify({ id: f.id, x: +f.x.toFixed(2), z: +f.z.toFixed(2), next: [ci, cj], fire: isl.fire[cidx(ci, cj)], walk: isl.walkable(ci, cj), blocked: f.blocked, anim: f.anim, task: f.task.type + ':' + f.task.phase, near: w.folk.concat(w.animals).filter((o) => o !== f && o.isle === f.isle && Math.hypot(o.x - f.x, o.z - f.z) < 0.9).map((o) => ({ k: o.kind || 'folk', id: o.id, anim: o.anim, d: +Math.hypot(o.x - f.x, o.z - f.z).toFixed(2) })) })); }
      bump(stat.stuck, `${f.task.type}:${f.task.phase || ''} ${f.anim}`);
      note(`stuck ${f.task.type}:${f.task.phase || ''} ${f.anim}`, `${tag} t=${w.time | 0}s`);
      anchors.set(f.id, { x: f.x, z: f.z, t: w.time, isle: f.isle });
    }
  }
}

function sample(w, tag) {
  stuckSample(w, tag);
  const movers = [];
  for (const f of w.folk) {
    if (f.anim === 'sleep' && f.task && f.task.inHome) continue;
    const p = worldPos(w, f);
    if (p) movers.push({ k: 'folk', o: f, r: RAD.folk, p });
  }
  for (const a of w.animals) {
    if (a.hidden || !RAD[a.kind] || a.gone) continue;
    const p = worldPos(w, a);
    if (p) movers.push({ k: a.kind, o: a, r: radOf(a), p });
  }
  stat.samples++; stat.movers += movers.length;
  for (let i = 0; i < movers.length; i++) {
    const A = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const B = movers[j];
      const dx = A.p.x - B.p.x; const dz = A.p.z - B.p.z;
      if (dx > 1 || dx < -1 || dz > 1 || dz < -1) continue;
      if (Math.hypot(dx, dz) >= overlapDist(A.o, B.o)) continue;
      const where = A.p.link || B.p.link ? 'link' : 'ground';
      const key = [A.k + ':' + (A.o.anim || ''), B.k + ':' + (B.o.anim || '')].sort().join(' | ');
      bump(stat.pair, `${where} ${key}`);
      bump(stat.kinds, `${where} ${[A.k, B.k].sort().join('-')}`);
      note(`${where} ${key}`, `${tag} t=${(w.time | 0)}s`);
      if (process.argv.includes('--dbg') && where === 'link' && (stat.dbgN = (stat.dbgN || 0) + 1) <= 12) {
        const d = (m) => JSON.stringify({ k: m.k, id: m.o.id, link: m.o.link ? { t: +m.o.link.t.toFixed(3), rev: m.o.link.rev, len: +m.o.link.l.len.toFixed(1) } : null, x: +m.o.x.toFixed(2), z: +m.o.z.toFixed(2), anim: m.o.anim, task: m.o.task && m.o.task.type + ':' + m.o.task.phase, dist: +Math.hypot(dx, dz).toFixed(2) });
        console.log('DBGPAIR', tag, w.time | 0, d(A), d(B));
      }
    }
    if (A.p.link) continue;
    const o = A.o;
    const isl = w.islands.get(o.isle);
    if (!isl) continue;
    const own = o.home && typeof o.home === 'object' ? o.home : null;
    const ci = Math.floor(o.x); const cj = Math.floor(o.z);
    const inCell = ci >= 0 && ci < N && cj >= 0 && cj < N;
    if (inCell) {
      const bi = isl.bld[cidx(ci, cj)];
      const b = bi >= 0 ? isl.buildings[bi] : null;
      if (b && b.id === 'campfire') { bump(stat.fire, `${A.k}:${o.anim} in campfire`); note(`${A.k}:${o.anim} in campfire`, `${tag} t=${w.time | 0}s`); }
      else if (b && !b.gone && b !== own && !passable(b) && o.x > b.x + 0.02 && o.x < b.x + b.size - 0.02 && o.z > b.y + 0.02 && o.z < b.y + b.size - 0.02) {
        const key = `${A.k}:${o.anim} in ${b.id}`;
        bump(stat.bld, key); note(key, `${tag} t=${w.time | 0}s`);
        if (process.argv.includes('--dbg') && !examples[key + '#']) { examples[key + '#'] = 1; console.log('DBG', key, JSON.stringify({ x: o.x, z: o.z, task: o.task && { type: o.task.type, phase: o.task.phase }, anim: o.anim, b: [b.x, b.y, b.size, b.built], cell: isl.walkable(ci, cj), t: w.time | 0 })); }
      }
      if (isl.fire[cidx(ci, cj)] > 0) { bump(stat.fire, `${A.k}:${o.anim} on flames`); note(`${A.k}:${o.anim} on flames`, `${tag} t=${w.time | 0}s`); }
    }
    const r = hitRect(isl, o.x, o.z, own);
    if (r) {
      const key = `${A.k}:${o.anim} in prop of ${r.b.id}`;
      bump(stat.bld, key); note(key, `${tag} t=${w.time | 0}s`);
    }
  }
}

function runBase(s) {
  seedRandom(777 + s * 31);
  const w = World.createNew(`SKY-OV${s}`);
  for (let t = 0; t < minutes * 600; t++) { w.step(0.1); if (t % 5 === 0) sample(w, `base${s}`); }
}

function setupHusbandry(s) {
  let w; let A; let B; let coopA; let penA; let svB; let coopB; let penB; let link;
  for (let attempt = 0; attempt < 20 && !(coopA && penA && svB && coopB && penB); attempt++) {
    seedRandom(4242 + s * 17 + attempt);
    w = World.createNew(`SKY-OVH${s}-${attempt}`);
    for (let t = 0; t < 1800; t++) w.step(0.1);
    A = w.getIsland(0, 0); B = w.getIsland(0, 1);
    w.reveal(B, true);
    w.planNow(A); w.planNow(B);
    link = makeLink(w, A, B);
    Object.assign(link, { type: 'ropebridge', state: 'done', progress: 1, built: true });
    link.pts = linkPoints(w, link);
    w.links.push(link);
    const put = (isl, id) => { const site = findSite(w, isl, id, isl.reach, null); return site ? startBuilding(w, isl, id, site.x, site.y, { built: true }) : null; };
    penA = put(A, 'pen'); coopA = put(A, 'coop');
    svB = put(B, 'storehouse'); coopB = put(B, 'coop'); penB = put(B, 'pen');
  }
  if (!(coopA && penA && svB && coopB && penB)) return null;
  const add = (kind, isl, home) => w.animals.push({ id: w.nextAnimal++, kind, isle: isl.id, x: home.door.i + 0.5 + (Math.random() - 0.5), z: home.door.j + 0.5 + (Math.random() - 0.5), alt: 0, face: 0, state: 'idle', t: 0, anim: 'idle', hidden: false, home, wait: 0, wool: 0.2, lay: 0, variant: 0 });
  for (let k = 0; k < 4; k++) add('hen', A, coopA);
  for (let k = 0; k < 3; k++) add('sheep', A, penA);
  for (let k = 0; k < 2; k++) add('hen', B, coopB);
  for (let k = 0; k < 2; k++) add('sheep', B, penB);
  w.animals.push({ id: w.nextAnimal++, kind: 'dog', isle: A.id, x: A.buildings[0].x + 0.5, z: A.buildings[0].y + 2.5, alt: 0, face: 0, state: 'dog', owner: null, path: null, pi: 0, idle: 0, repick: 60, stuck: 0, mode: null, t: 0, anim: 'idle', hidden: false });
  return { w, A, B, link };
}

function runHusbandry(s) {
  const sc = setupHusbandry(s);
  if (!sc) { console.log(`husbandry seed ${s}: setup failed, skipped`); return; }
  const { w, A, B, link } = sc;
  let nextTraffic = 0;
  for (let t = 0; t < minutes * 600; t++) {
    w.step(0.1);
    // Note: forced two-way traffic: one adult from each end sets out at the same moment.
    if (w.time >= nextTraffic && t % 10 === 0) {
      nextTraffic = w.time + 25;
      for (const isl of [A, B]) {
        const f = w.folk.find((o) => o.isle === isl.id && !o.link && !o.queue && o.stage === 'adult' && !(o.task && ['sleep', 'cross', 'herd', 'flee'].includes(o.task.type)));
        if (f) { f.queue = { type: 'cross', link, phase: 'go', t: 0 }; if (f.task) endTask(w, f, isl); }
      }
    }
    if (t % 5 === 0) sample(w, `husb${s}`);
  }
}

function runFires(s) {
  seedRandom(9100 + s * 13);
  const w = World.createNew(`SKY-OVF${s}`);
  let next = 120;
  for (let t = 0; t < minutes * 600; t++) {
    if (w.time >= next && t % 10 === 0) {
      next = w.time + 45;
      const isl = w.getIsland(0, 0);
      const walkers = w.folk.filter((f) => f.isle === isl.id && !f.link && !(f.anim === 'sleep' && f.task && f.task.inHome));
      const f = walkers[Math.floor(Math.random() * walkers.length)];
      if (f) {
        const i = Math.floor(f.x); const j = Math.floor(f.z);
        if (Math.random() < 0.5) { if (isl.land(i, j) && isl.bld[cidx(i, j)] < 0) { isl.fire[cidx(i, j)] = 0.9; isl.touch('plant'); } }
        else {
          const site = findSite(w, isl, 'hut', isl.reach, { i, j });
          if (site) startBuilding(w, isl, 'hut', site.x, site.y, { built: true });
        }
      }
    }
    w.step(0.1);
    if (t % 5 === 0) sample(w, `fire${s}`);
  }
}

const t0 = Date.now();
for (let s = 0; s < seeds; s++) {
  if (!ONLY || ONLY === 'base') runBase(s);
  if (!ONLY || ONLY === 'husb') runHusbandry(s);
  if (!ONLY || ONLY === 'fire') runFires(s);
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`samples ${stat.samples} (avg ${(stat.movers / Math.max(1, stat.samples)).toFixed(1)} movers); pair overlaps ${sum(stat.pair)}; building/prop ${sum(stat.bld)}; fire ${sum(stat.fire)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`hen samples inside ${stat.henIn || 0} / outside ${stat.henOut || 0}`);
console.log(`livelock episodes (6 s without moving 0.4): ${sum(stat.stuck)} ${JSON.stringify(stat.stuck)}`);
console.log(`avoid counters: ${JSON.stringify(AV)}`);
for (const [n, o] of Object.entries({ 'pair by kinds': stat.kinds, 'pair by anim': stat.pair, building: stat.bld, fire: stat.fire })) {
  const top = Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (top.length) console.log(`-- ${n}\n` + top.map(([k, v]) => `  ${v}\t${k}${examples[k] ? `  (first ${examples[k]})` : ''}`).join('\n'));
}
const bad = sum(stat.bld) + sum(stat.fire) + sum(stat.stuck) > 0 || sum(stat.pair) > maxPair;
if (STRICT && bad) { console.error('FAIL: overlaps found'); process.exit(1); }
console.log('done');
