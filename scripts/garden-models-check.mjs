// Note: node sanity checks for public/garden/js/models.js; run `node scripts/garden-models-check.mjs`.
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

const THREE = await import('three');
const M = await import(pathToFileURL(path.join(root, 'public/garden/js/models.js')).href);
const CFG = await import(pathToFileURL(path.join(root, 'public/garden/js/config.js')).href);

let failures = 0;
const fail = (m) => { failures++; console.error('FAIL:', m); };
const warn = (m) => console.warn('WARN:', m);

function meshesOf(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

function geoStats(geo, label) {
  const pos = geo.attributes.position;
  if (!pos) { fail(`${label}: no position`); return { tris: 0, vol: 0 }; }
  const a = pos.array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { fail(`${label}: NaN/inf in position`); break; }
  if (!geo.attributes.color) fail(`${label}: no color attribute`);
  else for (const v of geo.attributes.color.array) if (!Number.isFinite(v)) { fail(`${label}: NaN color`); break; }
  if (geo.index) fail(`${label}: indexed geometry`);
  const n = pos.count;
  if (n % 3) fail(`${label}: vertex count not multiple of 3`);
  // Note: signed volume via divergence theorem; negative suggests inward winding.
  let vol = 0;
  for (let i = 0; i < n; i += 3) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [a[i * 3], a[i * 3 + 1], a[i * 3 + 2], a[i * 3 + 3], a[i * 3 + 4], a[i * 3 + 5], a[i * 3 + 6], a[i * 3 + 7], a[i * 3 + 8]];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return { tris: n / 3, vol };
}

function objStats(obj, label) {
  let tris = 0;
  let vol = 0;
  let neg = 0;
  for (const m of meshesOf(obj)) {
    const s = geoStats(m.geometry, label);
    tris += s.tris;
    vol += s.vol;
    if (s.vol < 0 && m.material === M.MATS.vertex) neg++;
  }
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  return { tris, vol, neg, box };
}

const f2 = (v) => v.toFixed(2);
const size = (b) => `${f2(b.max.x - b.min.x)} x ${f2(b.max.y)} x ${f2(b.max.z - b.min.z)}`;
const ext = (b) => `x[${f2(b.min.x)},${f2(b.max.x)}] z[${f2(b.min.z)},${f2(b.max.z)}] y[${f2(b.min.y)},${f2(b.max.y)}]`;

// Note: folk.
console.log('\n== folk ==');
for (const stage of ['child', 'adult', 'elder', 'child|f', 'adult|f', 'elder|f']) {
  const [st, sx] = stage.split('|');
  const g = M.makeFolk(st, sx || 'm');
  const s = objStats(g, `folk ${stage}`);
  const rig = g.userData.rig;
  for (const k of ['body', 'head', 'armL', 'armR', 'legL', 'legR']) if (!rig?.[k]?.isObject3D) fail(`folk ${stage}: rig.${k} missing`);
  if (!meshesOf(g).every((m) => m.castShadow)) fail(`folk ${stage}: castShadow`);
  console.log(`${stage.padEnd(6)} tris=${String(s.tris).padStart(4)} height=${f2(s.box.max.y)} minY=${f2(s.box.min.y)} ${ext(s.box)}`);
  if (s.tris > 280) fail(`folk ${stage}: ${s.tris} tris > 280`);
}

// Note: plants.
console.log('\n== plants (max over 4 variants x ripe) ==');
for (const kind of CFG.PLANT_KINDS.filter((k) => k !== 'none')) {
  let maxT = 0, minT = 1e9;
  const bb = new THREE.Box3();
  for (let v = 0; v < 4; v++) {
    for (const ripe of [false, true]) {
      const geo = M.plantGeometry(kind, v, ripe);
      if (M.plantGeometry(kind, v, ripe) !== geo) fail(`plant ${kind}: not cached`);
      const s = geoStats(geo, `plant ${kind} v${v} r${ripe}`);
      maxT = Math.max(maxT, s.tris);
      minT = Math.min(minT, s.tris);
      geo.computeBoundingBox();
      bb.union(geo.boundingBox);
      if (geo.boundingBox.min.y < -0.03) fail(`plant ${kind}: below ground`);
    }
  }
  console.log(`${kind.padEnd(9)} tris ${minT}-${maxT}  footprint ${f2(bb.max.x - bb.min.x)} x ${f2(bb.max.z - bb.min.z)}  height ${f2(bb.max.y)}`);
  if (maxT > 120) fail(`plant ${kind}: ${maxT} tris > 120`);
  if (bb.max.x - bb.min.x > 1.05 || bb.max.z - bb.min.z > 1.05) fail(`plant ${kind}: footprint > 1 cell`);
}

// Note: buildings.
console.log('\n== buildings (max over seeds 0..7, levels) ==');
for (const id of CFG.BUILDING_IDS) {
  // Note: stairs and art are built by their own views, not makeBuilding.
  if (id === 'stairs' || id === 'art') continue;
  const size = CFG.BUILDINGS[id].size;
  const levels = id === 'hut' ? [0, 1, 2] : [0];
  for (const [lvl, tier] of levels.flatMap((l) => [[l, 0], [l, 4]])) {
    let maxT = 0, negs = 0;
    const bb = new THREE.Box3();
    let ud = null;
    for (let seed = 0; seed < 8; seed++) {
      const g = M.makeBuilding(id, lvl, seed, tier);
      const s = objStats(g, `building ${id} L${lvl} T${tier} s${seed}`);
      maxT = Math.max(maxT, s.tris);
      negs += s.neg;
      bb.union(s.box);
      ud = g.userData;
      for (const k of ['height', 'smoke', 'glow', 'glowColor', 'spin']) if (!(k in ud)) fail(`${id}: userData.${k} missing`);
      if (ud.smoke && !ud.smoke.isVector3) fail(`${id}: smoke not Vector3`);
      if (ud.glow && !ud.glow.isVector3) fail(`${id}: glow not Vector3`);
      if (Math.abs(ud.height - s.box.max.y) > 0.01) fail(`${id}: height mismatch`);
      if (id === 'windmill' && !ud.spin?.isObject3D) fail('windmill: spin missing');
      if (id === 'campfire' && !ud.flame) fail('campfire: flame missing');
      if (typeof ud.update === 'function') ud.update(1.23, 0.5);
    }
    // Note: the pad's bonfire ring and rails overhang its footprint slightly.
    // Note: tier props stand in front of the wall (folk spots sit 0.5 beyond it), so tiers may extend 0.65.
    const lim = size / 2 + (tier ? 0.65 : id === 'pad' ? 0.12 : CFG.BUILDINGS[id].role === 'landmark' ? 0.1 : 0.02);
    // Note: landmark kits may overhang by 0.1; footprints.js is built from the real model extent.
    // Note: the airdock pier juts along local +x up to 6.0; the other sides stay on its land block.
    const over = Math.max(-bb.min.x, id === 'airdock' ? 0 : bb.max.x, -bb.min.z, id === 'dock' ? 0 : bb.max.z);
    if (id === 'airdock' && bb.max.x > 6.0) fail(`airdock: pier reaches ${f2(bb.max.x)} > 6.0`);
    if (over > lim) fail(`${id} L${lvl} T${tier}: extends ${f2(over)} > ${f2(lim)}`);
    if (id === 'dock' && (bb.max.z < 1.4 || bb.max.z > 1.7)) fail(`dock: z max ${f2(bb.max.z)}`);
    // Note: top-tier flourishes get an extra triangle allowance.
    const budget = (id === 'hall' ? 1300 : id === 'pen' ? 800 : id === 'glassgarden' ? 700 : 600) + (tier ? 350 : 0);
    if (maxT > budget) fail(`${id}: ${maxT} tris > ${budget}`);
    if (negs) warn(`${id} L${lvl}: ${negs} meshes with negative signed volume`);
    console.log(`${(id + (id === 'hut' ? lvl : '') + (tier ? '+T' + tier : '')).padEnd(13)} size=${size} tris=${String(maxT).padStart(4)} h=${f2(ud.height)} ${ext(bb)} smoke=${!!ud.smoke} glow=${!!ud.glow}`);
  }
}

// Note: scaffold, crates, piles.
console.log('\n== scaffold / crate / piles ==');
for (const sz of [1, 2]) {
  const s = objStats(M.makeScaffold(sz), `scaffold ${sz}`);
  console.log(`scaffold ${sz}: tris=${s.tris} ${size(s.box)} ${ext(s.box)}`);
  if (Math.max(s.box.max.x, -s.box.min.x, s.box.max.z, -s.box.min.z) > sz / 2 + 0.02) fail(`scaffold ${sz}: too wide`);
}
let maxCrate = 0, maxPile = 0;
const pileBox = new THREE.Box3();
for (const gid of CFG.GOOD_IDS) {
  const c = objStats(M.makeCrate(gid), `crate ${gid}`);
  maxCrate = Math.max(maxCrate, c.tris);
  // Note: new goods carry an item above the lid, so their crates may reach 0.6.
  if (c.box.max.y > (CFG.NEW_GOODS[gid] ? 0.6 : 0.34) || c.box.max.x > 0.2) fail(`crate ${gid}: size ${ext(c.box)}`);
  let pt = 0;
  for (let n = 1; n <= 12; n++) {
    const p = objStats(M.makePile(gid, n), `pile ${gid} ${n}`);
    pt = Math.max(pt, p.tris);
    pileBox.union(p.box);
    if (p.box.max.x > 0.42 || p.box.min.x < -0.42 || p.box.max.z > 0.42 || p.box.min.z < -0.42) fail(`pile ${gid} ${n}: footprint ${ext(p.box)}`);
    if (p.box.min.y < -0.03) fail(`pile ${gid} ${n}: below ground ${f2(p.box.min.y)}`);
  }
  maxPile = Math.max(maxPile, pt);
  console.log(`${gid.padEnd(9)} pile max tris=${String(pt).padStart(3)} h12=${f2(objStats(M.makePile(gid, 12), '').box.max.y)}`);
}
console.log(`crate max tris=${maxCrate}  pile max tris=${maxPile}  pile bbox ${ext(pileBox)}`);

// Note: relics, memorials.
console.log('\n== relics / memorials ==');
for (const id of CFG.KNOWLEDGE_IDS) {
  const s = objStats(M.makeRelic(id), `relic ${id}`);
  console.log(`relic ${id.padEnd(10)} tris=${s.tris} h=${f2(s.box.max.y)} ${ext(s.box)}`);
}
{
  const l = objStats(M.makeMemorialLantern(), 'lantern');
  const t = objStats(M.makeMemorialTree(), 'memtree');
  console.log(`lantern tris=${l.tris} h=${f2(l.box.max.y)}   tree tris=${t.tris} h=${f2(t.box.max.y)} ${ext(t.box)}`);
}

// Note: links.
console.log('\n== links ==');
function mkPts(len, sag, rise = 0, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push({ x: u * len, y: rise * u - 4 * sag * u * (1 - u), z: 0.3 * Math.sin(u * 3) });
  }
  return pts;
}
for (const type of CFG.LINK_IDS) {
  const lens = type === 'vine' ? [4, 6] : type === 'ropebridge' ? [6, 11] : type === 'balloon' ? [12, 22] : [18, 34];
  for (const len of lens) {
    const sag = type === 'ropebridge' || type === 'vine' ? 0.6 : 0;
    const pts = mkPts(len, sag, type === 'cablecar' ? 3 : 0.5);
    let maxT = 0;
    for (const p of [0, 0.05, 0.25, 0.5, 0.75, 0.99, 1]) {
      const g = M.buildLinkMesh(type, pts, p);
      const s = objStats(g, `link ${type} ${len} p${p}`);
      maxT = Math.max(maxT, s.tris);
      if (p === 1) {
        if (type === 'balloon' && (!g.userData.balloon || g.userData.dock?.length !== 2)) fail('balloon: userData');
        if (type === 'cablecar' && (!g.userData.gondola || g.userData.cable?.length !== 2)) fail('cablecar: userData');
      }
    }
    console.log(`${type.padEnd(10)} len=${String(len).padStart(2)} max tris=${maxT}`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : '\nall checks passed');
process.exit(failures ? 1 : 0);
