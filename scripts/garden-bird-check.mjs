// Note: node check for bird perches (animals.js); run from the repo root with `node scripts/garden-bird-check.mjs`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { N } = await import('../public/garden/js/config.js');
const { cidx } = await import('../public/garden/js/island.js');
const AN = await import('../public/garden/js/animals.js');

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

const w = World.createNew('BIRD-0');
for (let k = 0; k < 150; k++) w.step(0.1);
const isl = w.getIsland(0, 0);
w.planNow(isl);
w.night = 0;

// Note: a bird perched in a tree sits at the canopy height, a bird on the ground at height 0, none anywhere else.
const perched = () => w.animals.filter((a) => a.kind === 'bird' && a.isle === isl.id && a.state === 'perch' && !a.hidden);
const sane = (tag) => {
  for (const a of perched()) {
    ok(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.alt), `${tag}: bird ${a.id} not finite`);
    ok(a.perch ? a.alt > 0 : a.alt === 0, `${tag}: bird ${a.id} perch ${JSON.stringify(a.perch)} alt ${a.alt}`);
    if (!a.perch) ok(isl.land(Math.floor(a.x), Math.floor(a.z)), `${tag}: bird ${a.id} sits off the land`);
  }
};

// Note: an island with free ground gets birds that settle correctly.
isl.revealed = true; isl.rung = Math.max(isl.rung | 0, 3);
for (let k = 0; k < 600; k++) { w.night = 0; if (k % 20 === 0) AN.topUpAnimals(w); AN.stepAnimals(w, 0.1); }
ok(w.animals.some((a) => a.kind === 'bird' && a.isle === isl.id), 'no bird arrived on an island with free ground');
sane('free island');

// Note: an island with no tree and no free cell gets no bird, and the ones present leave instead of hanging in the air.
for (let c = 0; c < N * N; c++) { isl.plant[c] = 0; isl.bld[c] = 0; }
const before = w.nextAnimal;
for (let k = 0; k < 1200; k++) {
  w.night = 0;
  if (k % 20 === 0) AN.topUpAnimals(w);
  AN.stepAnimals(w, 0.1);
  if (k % 50 === 0) sane('barren island');
}
ok(w.animals.filter((a) => a.kind === 'bird' && a.isle === isl.id && a.state !== 'gone' && a.state !== 'away').length === 0, 'birds stayed on an island with no seat');
ok(w.animals.every((a) => a.kind !== 'bird' || a.state !== 'fly' || Number.isFinite(a.dist)), 'a bird flies with no target');
void before;

console.log(failures ? `garden bird check: ${failures} failure(s)` : 'garden bird check: all ok');
process.exit(failures ? 1 : 0);
