// Note: geometry and data checks for the Garden endgame content (public/garden/js/content/*); run `NODE_NO_WARNINGS=1 node scripts/garden-content-check.mjs`.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = pathToFileURL(path.join(root, 'public/garden/vendor/three.module.js')).href;
// Note: loader hook maps the bare specifier 'three' to the vendored build.
const hook = `export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(s, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const J = (p) => pathToFileURL(path.join(root, 'public/garden/js', p)).href;
const THREE = await import('three');
const M = await import(J('models.js'));
const TK = await import(J('tiers/registry.js'));
const REG = await import(J('content/registry.js'));
const CONTENT = await import(J('content/index.js'));
const DEFS = await import(J('content/defs.js'));

// Note: models.js keeps Ctx and the builder private, so a probe kit on the campfire id captures them.
let probe = null;
{
  const old = TK.TIER_KITS.campfire;
  TK.TIER_KITS.campfire = (c, K) => { probe = { c, K }; };
  try { M.makeBuilding('campfire', 0, 0, 1); } finally { TK.TIER_KITS.campfire = old; }
}
if (!probe) { console.error('FAIL: could not probe the builder from models.js'); process.exit(1); }
const Ctx = probe.c.constructor;
const K = probe.K;
// Note: models.js fills ENV itself once wired; the script fills it only when empty.
if (!REG.ENV.MATS) Object.assign(REG.ENV, { MATS: K.MATS, GOLD: K.GOLD, FLAG_COLS: K.FLAG_COLS, gable: K.gable, plinth: K.plinth, Vector3: THREE.Vector3, Group: THREE.Group });

const GAP = 0.04; // Note: connectivity tolerance, looser than the tier check because lit panes and lamp caps sit just off walls.
const HARD = 560; // hard triangle cap for one landmark kit
const SOFT = 520; // warning level
const MIN_Y = -0.25;
const CRATE_MAX = 200;
const PILE_MAX = 340;
const SHIP_MAX = 450;
const STAGE_MAX = 420;
const HEIGHT_MAX = { landmark: 3.6, airdock: 3.0, memorial: 1.3, greatwork: 5.5 };

let failures = 0;
const fail = (m) => { failures++; console.error('FAIL:', m); };
const warn = (m) => console.warn('WARN:', m);
const f2 = (v) => v.toFixed(2);

// Note: prims of one mesh as AABBs in building space.
const _v = new THREE.Vector3();
function primsOf(mesh) {
  let prims = mesh.geometry.userData.prims;
  if (!Array.isArray(prims) || !prims.length) {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    prims = [[b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]];
  }
  const e = mesh.matrixWorld;
  return prims.map((p) => {
    const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
      _v.set(k & 1 ? p[3] : p[0], k & 2 ? p[4] : p[1], k & 4 ? p[5] : p[2]).applyMatrix4(e);
      for (let a = 0; a < 3; a++) { o[a] = Math.min(o[a], _v.getComponent(a)); o[a + 3] = Math.max(o[a + 3], _v.getComponent(a)); }
    }
    return { box: o, mesh: mesh.name };
  });
}

// Note: prims of a raw geometry (local coordinates) shifted by pos.
function rawPrims(geo, pos = [0, 0, 0], name = '') {
  return (geo.userData.prims || []).map((p) => ({ box: [p[0] + pos[0], p[1] + pos[1], p[2] + pos[2], p[3] + pos[0], p[4] + pos[1], p[5] + pos[2]], mesh: name }));
}

function gap(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(a[k] - b[k + 3], b[k] - a[k + 3], 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

// Note: connected components of prims under the gap tolerance; returns the list of components (index arrays).
function components(prims) {
  const n = prims.length;
  const comp = new Array(n).fill(-1);
  const out = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const id = out.length;
    const list = [s];
    comp[s] = id;
    for (let h = 0; h < list.length; h++) {
      const i = list[h];
      for (let j = 0; j < n; j++) if (comp[j] < 0 && gap(prims[i].box, prims[j].box) <= GAP) { comp[j] = id; list.push(j); }
    }
    out.push(list);
  }
  return out;
}

const union = (prims) => prims.reduce((u, p) => {
  for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], p.box[k]); u[k + 3] = Math.max(u[k + 3], p.box[k + 3]); }
  return u;
}, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);

const trisOf = (geo) => geo.attributes.position.count / 3;
function hashGeo(geos) {
  let h = 2166136261;
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  for (const g of geos) {
    for (const name of ['position', 'color']) {
      const a = g.attributes[name];
      if (!a) continue;
      for (let i = 0; i < a.array.length; i++) { f[0] = a.array[i]; h = Math.imul(h ^ u[0], 16777619) >>> 0; }
    }
  }
  return h;
}
const meshesOf = (obj) => { const out = []; obj.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };

// Note: builds one kit into a fresh Ctx; tag makes a unique cache key so geometry is rebuilt.
function buildKit(id, v, d, tag = '', tier = 0) {
  const c = new Ctx(id, 0, v, d, tier);
  if (tag) c.key += `|${tag}`;
  REG.LANDMARK_KITS[id](c, K.B, K.C);
  c.g.updateMatrixWorld(true);
  return c;
}

const rows = [];

// Note: 1. data tables.
{
  const LM = DEFS.LANDMARKS;
  const lmIds = Object.keys(LM);
  if (lmIds.length !== 14) fail(`LANDMARKS has ${lmIds.length} entries, expected 14`);
  const traits = new Set(lmIds.map((i) => LM[i].trait));
  if (traits.size !== 14) fail('LANDMARKS traits are not unique');
  for (const [t, id] of Object.entries(DEFS.TRAIT_LANDMARK)) if (LM[id].trait !== t) fail(`TRAIT_LANDMARK ${t} -> ${id} mismatch`);
  if (Object.keys(DEFS.TRAIT_LANDMARK).length !== 14) fail('TRAIT_LANDMARK should list 14 traits');
  const rare = Object.keys(DEFS.TRAIT_RARE_GOOD);
  if (rare.length !== 6 || new Set(Object.values(DEFS.TRAIT_RARE_GOOD)).size !== 6) fail('TRAIT_RARE_GOOD must map 6 traits to 6 goods');
  for (const [t, g] of Object.entries(DEFS.TRAIT_RARE_GOOD)) if (LM[DEFS.TRAIT_LANDMARK[t]].rare !== g) fail(`landmark of ${t} should carry rare ${g}`);
  if (DEFS.SPECIALTY_GOODS.length !== 7 || DEFS.RARE_GOODS.length !== 6 || DEFS.LUXURY_GOODS.length !== 3) fail('good lists must be 7 specialty, 6 rare, 3 luxury');
  const ng = Object.keys(DEFS.NEW_GOODS);
  if (ng.length !== 16) fail(`NEW_GOODS has ${ng.length} entries, expected 16`);
  for (const g of DEFS.RARE_GOODS) if (!DEFS.NEW_GOODS[g] || !DEFS.NEW_GOODS[g].rare) fail(`${g} must be flagged rare`);
  for (const g of DEFS.LUXURY_GOODS) if (!DEFS.NEW_GOODS[g] || !DEFS.NEW_GOODS[g].luxury) fail(`${g} must be flagged luxury`);
  if (DEFS.AIRSHIP_KINDS.join() !== 'cargo,trader,explorer,military') fail('AIRSHIP_KINDS order');
  if (DEFS.GW_STAGES.length !== 7) fail(`GW_STAGES has ${DEFS.GW_STAGES.length} entries, expected 7`);
  const gwGoods = DEFS.GW_STAGES.slice(1).map((s) => s.good).sort().join();
  if (gwGoods !== [...DEFS.RARE_GOODS].sort().join()) fail('GW_STAGES 1..6 must hold each rare good exactly once');
  if (DEFS.GW_STAGES[0].good !== null || !DEFS.GW_STAGES.every((s) => s.cost && Object.keys(s.cost).length)) fail('GW_STAGES entries need a cost, stage 0 good null');
  // Note: recipe goods must exist; config.js is read-only here and may be mid-edit.
  let known = null;
  try { const CFG = await import(J('config.js')); known = new Set([...Object.keys(CFG.GOODS), ...ng]); } catch (e) { warn(`config.js not importable (${e.message}); recipe goods unchecked`); }
  if (known) {
    for (const [id, d] of Object.entries({ ...LM, ...DEFS.EXTRA_BUILDINGS })) {
      for (const [k, n] of Object.entries(d.cost || {})) if (!known.has(k) || !(n > 0)) fail(`${id}: cost good ${k} unknown or empty`);
      if (d.recipe) for (const part of ['in', 'out']) for (const k of Object.keys(d.recipe[part])) if (!known.has(k)) fail(`${id}: recipe good ${k} unknown`);
    }
    for (const g of DEFS.SPECIALTY_GOODS) if (!Object.values(LM).some((d) => d.good === g)) fail(`specialty ${g} has no landmark`);
    for (const s of DEFS.GW_STAGES) for (const k of Object.keys(s.cost)) if (!known.has(k)) fail(`GW stage cost good ${k} unknown`);
  }
}

// Note: 2. landmark-like buildings.
const KITS = [
  ...Object.keys(DEFS.LANDMARKS).map((id) => ({ id, size: DEFS.LANDMARKS[id].size, kind: 'landmark' })),
  // Note: the airdock kit reads c.tier, so check the small, middle and grand pier.
  ...[0, 3, 4].map((tier) => ({ id: 'airdock', size: DEFS.EXTRA_BUILDINGS.airdock.size, kind: 'airdock', tier })),
  { id: 'memorial', size: DEFS.EXTRA_BUILDINGS.memorial.size, kind: 'memorial' },
  { id: 'greatwork', size: DEFS.EXTRA_BUILDINGS.greatwork.size, kind: 'greatwork' },
];
const MAT = K.MATS;
for (const { id, size, kind, tier = 0 } of KITS) {
  if (!REG.LANDMARK_KITS[id]) { fail(`${id}: no LANDMARK_KITS entry`); continue; }
  const half = size / 2 + 0.1;
  // Note: the airdock pier juts along local +x to about 5.9 and cable stays or braces reach down to -0.9.
  const ext = kind === 'airdock' ? { x0: half, x1: 6.0, z: half } : { x0: half, x1: half, z: half };
  const row = { id, size, tris: 0, maxTris: 0, lit: 0, lamps: 0, bbox: '' };
  const hashes = new Set();
  for (let d = 0; d < 2; d++) {
    for (let v = 0; v < 4; v++) {
      const tag = `${id}${tier ? ` t${tier}` : ''} v${v} d${d}`;
      let c;
      try { c = buildKit(id, v, d, `chk1t${tier}`, tier); } catch (e) { fail(`${tag}: throws ${e.message}`); continue; }
      const meshes = meshesOf(c.g);
      if (!meshes.length) { fail(`${tag}: no meshes`); continue; }
      const names = meshes.map((m) => m.name);
      if (new Set(names).size !== names.length) fail(`${tag}: duplicate mesh names ${names.join()}`);
      const t = meshes.reduce((n, m) => n + trisOf(m.geometry), 0);
      row.tris = Math.max(row.tris, t);
      if (t > HARD) fail(`${tag}: ${t} triangles (cap ${HARD})`);
      else if (t > SOFT) warn(`${tag}: ${t} triangles (soft ${SOFT})`);
      const prims = meshes.flatMap(primsOf);
      const u = union(prims);
      row.bbox = u.map(f2).join(' ');
      if (kind === 'airdock') {
        // Note: the land part stays inside the block, only the pier side may pass it.
        if (-u[0] > half + 0.02 || -u[2] > ext.z + 0.02 || u[5] > half + 0.02 || u[3] > ext.x1) fail(`${tag}: airdock extent ${u.map(f2).join(' ')}`);
      } else if (Math.max(-u[0], u[3], -u[2], u[5]) > half + 0.02) fail(`${tag}: footprint extent ${f2(Math.max(-u[0], u[3], -u[2], u[5]))} exceeds ${f2(half)}`);
      if (u[1] < (kind === 'airdock' ? -0.9 : MIN_Y)) fail(`${tag}: reaches below y ${f2(u[1])}`);
      if (u[4] > HEIGHT_MAX[kind]) fail(`${tag}: height ${f2(u[4])} exceeds ${HEIGHT_MAX[kind]}`);
      const comps = components(prims);
      if (comps.length > 1) {
        const parts = comps.map((l) => `{${[...new Set(l.map((i) => prims[i].mesh))].join(',')}}`).join(' ');
        fail(`${tag}: ${comps.length} disconnected groups ${parts}`);
        if (process.env.DEBUG && v === 0 && d === 0) {
          comps.forEach((l, k) => {
            console.error('   comp', k, union(l.map((i) => prims[i])).map(f2).join(' '), `prims ${l.length}`);
            if (k === 0) return;
            for (const i of l) {
              let best = null;
              comps[0].forEach((j) => { const gg = gap(prims[i].box, prims[j].box); if (!best || gg < best.g) best = { g: gg, j }; });
              console.error('     prim', prims[i].mesh, prims[i].box.map(f2).join(' '), '| nearest main', prims[best.j].mesh, prims[best.j].box.map(f2).join(' '), 'gap', f2(best.g));
            }
          });
        }
      }
      // Note: lit meshes use MATS.glow; lamps come from ud.lamps.
      const lit = meshes.filter((m) => m.material === MAT.glow).length;
      const lamps = (c.ud.lamps || []).length;
      row.lit = lit; row.lamps = lamps;
      if (lit + (c.ud.glow ? 1 : 0) < 1) fail(`${tag}: nothing lit at night`);
      if (lamps < 1 || lamps > 3) fail(`${tag}: ${lamps} lamps (want 1..3)`);
      for (const l of c.ud.lamps || []) if (kind === 'airdock' ? (l.x < -half || l.x > 6.0 || Math.abs(l.z) > half || l.y < 0) : (Math.abs(l.x) > half || Math.abs(l.z) > half || l.y < 0)) fail(`${tag}: lamp outside footprint`);
      for (const p of [c.ud.plumes, c.ud.smoke ? [c.ud.smoke] : []].flat().filter(Boolean)) if (Math.abs(p.x) > half || Math.abs(p.z) > half) fail(`${tag}: plume outside footprint`);
      if (id === 'airdock') {
        // Note: two moors, one per hull slot, on the pier axis x = 3.9 at z -0.68 (slot 0) and +0.68 (slot 1); ud.moor is slot 0.
        const ms = c.ud.moors;
        if (!Array.isArray(ms) || ms.length !== 2) fail(`${tag}: airdock needs two ud.moors`);
        else {
          if (c.ud.moor !== ms[0]) fail(`${tag}: ud.moor must be moors[0]`);
          ms.forEach((m, k) => { if (m.y < 1.5 || m.y > 2.6 || Math.abs(m.x - 3.9) > 0.3 || Math.abs(m.z - (k ? 0.68 : -0.68)) > 0.3) fail(`${tag}: moor ${k} at ${m.x},${m.y},${m.z} off its slot`); });
        }
      }
      // Note: determinism, a second uncached build must match bit for bit.
      let c2;
      try { c2 = buildKit(id, v, d, `chk2t${tier}`, tier); } catch (e) { fail(`${tag}: second build throws ${e.message}`); continue; }
      const h1 = hashGeo(meshes.map((m) => m.geometry));
      const h2 = hashGeo(meshesOf(c2.g).map((m) => m.geometry));
      if (h1 !== h2) fail(`${tag}: not deterministic`);
      hashes.add(h1);
    }
  }
  row.variants = hashes.size;
  if (id === 'memorial' && hashes.size < 4) fail(`memorial: only ${hashes.size} distinct variants, want 4 deed icons`);
  if (id === 'memorial') {
    const deed = new Set();
    for (let v = 0; v < 4; v++) deed.add(hashGeo(meshesOf(buildKit('memorial', v, 0, 'chk3').g).map((m) => m.geometry)));
    if (deed.size !== 4) fail(`memorial: deed icons v0..3 give ${deed.size} distinct meshes`);
  }
  rows.push(row);
}

// Note: 3. goods, crate and pile.
const goodRows = [];
{
  const { rng, hashStr } = await import(J('rand.js'));
  const ids = Object.keys(DEFS.NEW_GOODS);
  for (const id of ids) {
    const gm = REG.GOOD_MODELS[id];
    if (!gm || typeof gm.crate !== 'function' || typeof gm.pile !== 'function') { fail(`${id}: GOOD_MODELS needs crate and pile`); continue; }
    const col = DEFS.NEW_GOODS[id].color;
    const row = { id, crate: 0, pile1: 0, pile12: 0 };
    try {
      const b = new K.B(); gm.crate(b, K.C, col); const g = b.build();
      row.crate = trisOf(g);
      if (row.crate > CRATE_MAX) fail(`${id} crate: ${row.crate} triangles (cap ${CRATE_MAX})`);
      const prims = rawPrims(g);
      const u = union(prims);
      if (Math.max(-u[0], u[3], -u[2], u[5]) > 0.2) fail(`${id} crate: wider than 0.4 (${u.map(f2).join(' ')})`);
      if (u[1] < -0.01 || u[1] > 0.01) fail(`${id} crate: bottom at y ${f2(u[1])}, want 0`);
      if (u[4] > 0.62) fail(`${id} crate: height ${f2(u[4])}`);
      const comps = components(prims);
      if (comps.length > 1) fail(`${id} crate: ${comps.length} disconnected groups`);
      const b2 = new K.B(); gm.crate(b2, K.C, col);
      if (hashGeo([b2.build()]) !== hashGeo([g])) fail(`${id} crate: not deterministic`);
    } catch (e) { fail(`${id} crate: throws ${e.message}`); }
    let prev = 0;
    for (let n = 1; n <= 12; n++) {
      try {
        const mk = () => { const b = new K.B(); gm.pile(b, n, K.C, col, rng(hashStr(id) + 7)); return b.build(); };
        const g = mk();
        const t = trisOf(g);
        if (n === 1) row.pile1 = t;
        if (n === 12) row.pile12 = t;
        if (t < 1) fail(`${id} pile ${n}: empty`);
        if (t < prev) fail(`${id} pile ${n}: fewer triangles than pile ${n - 1}`);
        prev = t;
        if (t > PILE_MAX) fail(`${id} pile ${n}: ${t} triangles (cap ${PILE_MAX})`);
        const prims = rawPrims(g);
        const u = union(prims);
        if (Math.max(-u[0], u[3], -u[2], u[5]) > 0.5) fail(`${id} pile ${n}: extent ${f2(Math.max(-u[0], u[3], -u[2], u[5]))} over 0.5`);
        if (u[1] < -0.01) fail(`${id} pile ${n}: below the ground ${f2(u[1])}`);
        if (u[4] > 0.7) fail(`${id} pile ${n}: height ${f2(u[4])}`);
        // Note: a raised item must rest on a lower one that overlaps it in the ground plane.
        prims.forEach((p, i) => {
          if (p.box[1] <= 0.03) return;
          const ok = prims.some((q, j) => j !== i && q.box[4] >= p.box[1] - 0.05 && q.box[1] < p.box[1] && q.box[0] <= p.box[3] + 0.02 && q.box[3] >= p.box[0] - 0.02 && q.box[2] <= p.box[5] + 0.02 && q.box[5] >= p.box[2] - 0.02);
          if (!ok) fail(`${id} pile ${n}: item ${i} floats at y ${f2(p.box[1])}`);
        });
        if (hashGeo([mk()]) !== hashGeo([g])) fail(`${id} pile ${n}: not deterministic`);
      } catch (e) { fail(`${id} pile ${n}: throws ${e.message}`); }
    }
    goodRows.push(row);
  }
}

// Note: 4. airships.
const shipRows = [];
for (const kind of DEFS.AIRSHIP_KINDS) {
  const fn = REG.SHIP_MODELS[kind];
  if (!fn) { fail(`${kind}: no SHIP_MODELS entry`); continue; }
  const row = { kind, tris: 0, slots: 0, height: 0 };
  try {
    const r = fn(K.B, K.C);
    for (const k of ['body', 'glow', 'flag', 'prop', 'lamps', 'slots', 'height']) if (r[k] === undefined) fail(`${kind}: result lacks ${k}`);
    const t = trisOf(r.body) + trisOf(r.glow) + trisOf(r.flag.geo) + trisOf(r.prop.geo);
    row.tris = t; row.slots = r.slots.length; row.height = r.height;
    if (t > SHIP_MAX) fail(`${kind}: ${t} triangles (cap ${SHIP_MAX})`);
    const bodyPrims = [...rawPrims(r.body, [0, 0, 0], 'body'), ...rawPrims(r.glow, [0, 0, 0], 'glow')];
    const comps = components(bodyPrims);
    if (comps.length > 1) {
      fail(`${kind}: body has ${comps.length} disconnected groups`);
      if (process.env.DEBUG) comps.forEach((l, k) => console.error('   comp', k, union(l.map((i) => bodyPrims[i])).map(f2).join(' '), `prims ${l.length}`));
    }
    const u = union(bodyPrims);
    const near = (list) => list.some((p) => bodyPrims.some((q) => gap(p.box, q.box) <= GAP));
    if (!near(rawPrims(r.flag.geo, r.flag.pos, 'flag'))) fail(`${kind}: flag does not touch the body`);
    if (!near(rawPrims(r.prop.geo, r.prop.pos, 'prop'))) {
      fail(`${kind}: propeller does not touch the body`);
      if (process.env.DEBUG) console.error('   prop', union(rawPrims(r.prop.geo, r.prop.pos)).map(f2).join(' '));
    }
    if (u[1] < -0.01 || u[1] > 0.01) fail(`${kind}: gondola floor at y ${f2(u[1])}, want 0`);
    if (r.height < u[4] - 0.01 || r.height > u[4] + 0.6) fail(`${kind}: height ${f2(r.height)} vs body top ${f2(u[4])}`);
    const cap = DEFS.AIRSHIP_INFO[kind].cap;
    if (r.slots.length !== cap) fail(`${kind}: ${r.slots.length} slots, cap ${cap}`);
    r.slots.forEach(([x, y, z], i) => {
      const deck = bodyPrims.some((q) => Math.abs(q.box[4] - y) <= 0.03 && q.box[0] <= x - 0.14 + 0.02 && q.box[3] >= x + 0.14 - 0.02 && q.box[2] <= z - 0.14 + 0.02 && q.box[5] >= z + 0.14 - 0.02);
      if (!deck) fail(`${kind}: slot ${i} is not on a deck`);
      r.slots.forEach(([x2, , z2], j) => { if (j > i && Math.abs(x - x2) < 0.28 && Math.abs(z - z2) < 0.28) fail(`${kind}: slots ${i} and ${j} overlap`); });
    });
    if (!r.lamps.length || r.lamps.some((l) => l.length !== 3)) fail(`${kind}: bad lamps`);
    if (trisOf(r.glow) < 1) fail(`${kind}: nothing lit`);
    const r2 = fn(K.B, K.C);
    if (hashGeo([r.body, r.glow, r.flag.geo, r.prop.geo]) !== hashGeo([r2.body, r2.glow, r2.flag.geo, r2.prop.geo])) fail(`${kind}: not deterministic`);
  } catch (e) { fail(`${kind}: throws ${e.message}`); }
  shipRows.push(row);
}

// Note: 5. spire stages, every subset of stages 1..7 on top of stage 0 must stay connected.
const spireRows = [];
{
  const S = REG.SPIRE;
  if (typeof S.buildStage !== 'function') fail('SPIRE.buildStage missing');
  else {
    const stages = [];
    for (let s = 0; s <= 7; s++) {
      try {
        const r = S.buildStage(s, K.B, K.C);
        const t = trisOf(r.body) + trisOf(r.glow);
        const prims = [...rawPrims(r.body, [0, 0, 0], `s${s}`), ...rawPrims(r.glow, [0, 0, 0], `s${s}g`)];
        stages.push(prims);
        spireRows.push({ stage: s, tris: t });
        if (t > (s === 0 ? HARD : STAGE_MAX)) fail(`spire stage ${s}: ${t} triangles`);
        const u = union(prims);
        if (Math.max(-u[0], u[3], -u[2], u[5]) > 2.12) fail(`spire stage ${s}: extent over the size-4 footprint`);
        if (u[1] < -0.01) fail(`spire stage ${s}: below ground`);
        if (s === 0 && components(prims).length > 1) fail('spire stage 0: disconnected');
        const r2 = S.buildStage(s, K.B, K.C);
        if (hashGeo([r.body, r.glow]) !== hashGeo([r2.body, r2.glow])) fail(`spire stage ${s}: not deterministic`);
        if (trisOf(r.glow) < 1) fail(`spire stage ${s}: nothing lit`);
      } catch (e) { fail(`spire stage ${s}: throws ${e.message}`); }
    }
    if (stages.length === 8) {
      for (let mask = 0; mask < 128; mask++) {
        const prims = [...stages[0]];
        const used = [];
        for (let s = 1; s <= 7; s++) if (mask & (1 << (s - 1))) { prims.push(...stages[s]); used.push(s); }
        const comps = components(prims);
        if (comps.length > 1) fail(`spire stages 0+[${used.join(',')}]: ${comps.length} disconnected groups`);
      }
    }
    try {
      const total = spireRows.reduce((n, r) => n + r.tris, 0);
      spireRows.push({ stage: 'all', tris: total });
      if (total > 1800) warn(`spire complete: ${total} triangles`);
    } catch { /* Note: stage failures are already reported. */ }
  }
}

// Note: 6. report.
const pad = (s, n) => String(s).padEnd(n);
console.log('\nlandmark-like buildings');
console.log(pad('id', 16), pad('size', 5), pad('tris', 6), pad('lit', 4), pad('lamps', 6), pad('variants', 9), 'bbox');
for (const r of rows) console.log(pad(r.id, 16), pad(r.size, 5), pad(r.tris, 6), pad(r.lit, 4), pad(r.lamps, 6), pad(r.variants, 9), r.bbox);
console.log('\ngoods (triangles)');
console.log(pad('id', 12), pad('crate', 7), pad('pile1', 7), 'pile12');
for (const r of goodRows) console.log(pad(r.id, 12), pad(r.crate, 7), pad(r.pile1, 7), r.pile12);
console.log('\nairships');
for (const r of shipRows) console.log(pad(r.kind, 10), `tris ${pad(r.tris, 5)} slots ${r.slots} height ${f2(r.height)}`);
console.log('\nspire stages');
for (const r of spireRows) console.log(pad(`stage ${r.stage}`, 10), r.tris);
console.log(failures ? `\n${failures} failure(s)` : '\nall content checks passed');
process.exit(failures ? 1 : 0);
