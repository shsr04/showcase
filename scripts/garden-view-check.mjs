// Note: headless render-layer check: builds meshes in node (no WebGL) and runs the view for simulated minutes.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-view-check.mjs [minutes] [seed]
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = pathToFileURL(path.join(root, 'public/garden/vendor/three.module.js')).href;
const hook = `export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(s, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const THREE = await import('three');
const { World } = await J('world.js');
const { WorldView } = await J('view.js');
const { Sky } = await J('sky.js');
const { Fx } = await J('fx.js');
const { OrbitCamera } = await J('camera.js');
const { applyTool } = await J('sim.js');

const minutes = Number(process.argv[2] || 12);
const seed = process.argv[3] || 'SKY-0001';
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL:', m); };

const scene = new THREE.Scene();
const oc = new OrbitCamera(1.6);
const sky = new Sky(scene, null, false);
const fx = new Fx(scene);
const world = World.createNew(seed);
const view = new WorldView(scene, world, fx);

const DT = 0.1;
let t0 = Date.now();
let evCount = 0;
const types = new Set();
for (let t = 0; t < minutes * 60; t += DT) {
  world.step(DT);
  for (const e of world.events.splice(0)) { evCount++; types.add(e.type); if (e.type === 'reveal') view.onReveal(e.isl); }
  if (t > 30 && t < 31) {
    // Note: exercises the tools the player would use.
    const home = world.islands.get('0,0');
    applyTool(world, home, 'dig', 12, 12, 2, 0.1);
    applyTool(world, home, 'rain', 12, 12, 2, 0, { drop: true });
    applyTool(world, home, 'wind', 0, 0, 0, 0, { dx: 1, dz: 0.3 });
    applyTool(world, home, 'fire', 4, 4, 2, 0.2);
  }
  oc.update(DT);
  oc.cam.updateMatrixWorld();
  oc.cam.matrixWorldInverse.copy(oc.cam.matrixWorld).invert();
  const haze = sky.update(world, DT, oc.target, oc.cam);
  view.update(DT, oc.target, oc.cam, sky, haze);
  fx.update(DT, oc.cam, 900);
}
const ms = Date.now() - t0;

// Note: every held tool prop must build with vertices.
const { makeProp, PROP_KINDS } = await J('models.js');
for (const k of PROP_KINDS) {
  let n = 0;
  makeProp(k).traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
  if (n < 12) fail(`prop ${k} empty`);
}
// Note: every art kind x archetype builds; bunting too.
const { makeArt, makeBunting } = await J('models.js');
const art = await J('art.js');
for (const kind of Object.keys(art.ART_KINDS)) for (const arch of art.ARCH_IDS) for (const x of [0, 1, 2, 3]) {
  let n = 0;
  makeArt({ kind, arch, x, y: 0 }).traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
  if (n < 12) fail(`art ${kind}/${arch}/${x} empty`);
}
{
  let n = 0;
  makeBunting([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 2 }], 4).traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
  if (n < 30) fail('bunting empty');
}
{
  const { makeBeret } = await J('models.js');
  let n = 0;
  makeBeret().traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
  if (n < 12) fail('beret empty');
}
{
  const { makeBuilding, makeBalloon } = await J('models.js');
  for (const id of ['bonfire', 'pad', 'coop', 'pen', 'glassgarden']) {
    let n = 0;
    makeBuilding(id).traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
    if (n < 40) fail(`${id} empty`);
  }
  let n = 0;
  makeBalloon().traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
  if (n < 40) fail('balloon empty');
}
{
  const { makeDog, makeBird, makeButterfly, makeHen, makeSheep, makeStrawHat } = await J('models.js');
  if (makeStrawHat().geometry.attributes.position.count < 20) fail('straw hat empty');
  for (const [name, fn, min] of [['dog', makeDog, 150], ['bird', makeBird, 80], ['butterfly', makeButterfly, 20], ['hen', makeHen, 100], ['sheep', makeSheep, 150]]) for (const v of [0, 1, 2, 3]) {
    let n = 0;
    fn(v).traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
    if (n < min) fail(`${name} ${v} empty (${n})`);
  }
}
let propsSeen = 0;
for (const fv of view.folkViews.values()) if (fv.propObj) propsSeen++;
console.log('props', PROP_KINDS.length, 'held now', propsSeen);

const revealed = world.revealedIslands().length;
const plantInst = [...view.plants.meshes.values()].reduce((s, m) => s + m.count, 0);
const visFolk = [...view.folkViews.values()].filter((f) => f.obj.visible).length;
console.log(`sim ${minutes}min in ${ms}ms: revealed ${revealed}, islands ${world.islands.size}, folk ${world.folk.length} (views ${view.folkViews.size}, visible ${visFolk}), links ${world.links.length} (views ${view.linkViews.size})`);
console.log(`plant instances ${plantInst}, meshes ${view.plants.meshes.size}, terrainMeshes ${view.terrainMeshes().length}, events ${evCount} [${[...types].join(',')}]`);
let bviews = 0; let piles = 0;
for (const v of view.views.values()) { bviews += v.bviews.size; piles += v.pileGroup.children.length; }
console.log(`building views ${bviews}, piles ${piles}, lights ${view.lightPool.filter((l) => l.intensity > 0).length}`);

if (view.terrainMeshes().length !== revealed) fail('terrain mesh count differs from revealed islands');
if (view.folkViews.size !== world.folk.length) fail('folk view count differs');
{
  const live = world.animals.filter((a) => world.islands.get(a.isle).revealed);
  const vis = [...view.animalViews.values()].filter((v) => v.obj.visible).length;
  console.log(`animals ${world.animals.length} (views ${view.animalViews.size}, visible ${vis})`);
  if (view.animalViews.size !== live.length) fail('animal view count differs');
  for (const av of view.animalViews.values()) if (av.p && !Number.isFinite(av.obj.position.x + av.obj.position.y + av.obj.position.z + av.obj.rotation.y)) { fail('NaN animal position'); break; }
}
if (plantInst < 10) fail('too few plant instances');
if (bviews < 2) fail('too few building views');
for (const v of view.views.values()) {
  const p = v.terrain.geometry.attributes.position;
  for (let k = 0; k < p.count; k++) if (!Number.isFinite(p.getY(k))) { fail(`NaN terrain on ${v.isl.id}`); break; }
}
for (const fv of view.folkViews.values()) if (!Number.isFinite(fv.obj.position.x + fv.obj.position.y + fv.obj.position.z)) { fail('NaN folk position'); break; }

// Note: save and load roundtrip still works with the view alive.
const { World: W2 } = await J('world.js');
const w2 = W2.fromJSON(JSON.parse(JSON.stringify(world.toJSON())));
const view2 = new WorldView(new THREE.Scene(), w2, new Fx(new THREE.Scene()));
view2.update(0.1, oc.target, oc.cam, sky, sky.haze);
if (view2.views.size !== w2.islands.size) fail('restored view size');
view.dispose(); view2.dispose();

console.log(failures ? `${failures} failure(s)` : 'ok');
process.exit(failures ? 1 : 0);
